import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import * as crypto from 'crypto';
import { CryptoService } from '../../common/crypto/crypto.service';
import { User, UserDocument, ImapAccount } from '../../database/schemas/user.schema';
import { EmailRaw, EmailRawDocument } from '../../database/schemas/email-raw.schema';
import { QUEUES, QUEUE_DEFAULT_JOB_OPTIONS } from '../../queues/queue.constants';

// ─── Provider config ─────────────────────────────────────────────────────────

export const IMAP_PROVIDERS: Record<string, { host: string; port: number }> = {
  yahoo: { host: 'imap.mail.yahoo.com', port: 993 },
  gmail: { host: 'imap.gmail.com', port: 993 },
  outlook: { host: 'outlook.office365.com', port: 993 },
};

// ─── Indian bank pre-filter ───────────────────────────────────────────────────

/** Sender patterns for known Indian banks */
const BANK_SENDER_PATTERNS: RegExp[] = [
  // Specific addresses mentioned in requirements
  /alerts@axis\.bank\.in/i,
  /alerts@hdfcbank\.bank\.in/i,
  /noreply@idfcfirstbank\.com/i,
  /alerts@yes\.bank\.in/i,
  // Broader domain patterns
  /@.*axisbank\./i,
  /@.*hdfcbank\./i,
  /@.*icicibank\./i,
  /@.*idfcfirstbank\./i,
  /@.*yesbank\./i,
  /@.*kotakbank\./i,
  /@.*kotak\./i,
  /@.*sbi\./i,
  /@.*indusind\./i,
  /@.*pnbindia\./i,
  /@.*bankofbaroda\./i,
  /@.*federalbank\./i,
  /@.*rbl.*bank\./i,
  // Generic bank-related domains
  /@.*\.bank\./i,
  /@.*bank.*alert/i,
  /transaction.*@/i,
  /alerts@/i,
];

/** Subject patterns that indicate a transaction email */
const TRANSACTION_SUBJECT_PATTERNS: RegExp[] = [
  /transaction\s+alert/i,
  /you\s+have\s+done\s+a\s+upi\s+txn/i,
  /upi\s+(txn|transaction)/i,
  /inr\s+[\d,]+\s+spent/i,
  /rs\.?\s*[\d,]+\s+(debited|spent|charged)/i,
  /spent\s+on\s+.*credit\s+card/i,
  /debited\s+from\s+.*account/i,
  /credit\s+card\s+(used|alert|statement)/i,
  /debit\s+card\s+(used|alert)/i,
  /payment\s+(successful|confirmation|alert)/i,
  /successful\s+transaction/i,
  /card\s+.*\s+used/i,
  /a\/c\s+debited/i,
  /amount\s+debited/i,
];

function isLikelyBankEmail(from: string, subject: string): boolean {
  const fromLow = from.toLowerCase();
  const subjectLow = subject.toLowerCase();
  return (
    BANK_SENDER_PATTERNS.some((p) => p.test(fromLow)) ||
    TRANSACTION_SUBJECT_PATTERNS.some((p) => p.test(subjectLow))
  );
}

/** Format a JS Date as DD-Mon-YYYY for IMAP SINCE criterion */
function formatImapDate(date: Date): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = date.getUTCDate().toString().padStart(2, '0');
  const m = MONTHS[date.getUTCMonth()];
  const y = date.getUTCFullYear();
  return `${d}-${m}-${y}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ImapService implements OnApplicationShutdown {
  private readonly logger = new Logger(ImapService.name);
  /** Active IMAP connections per user (for graceful shutdown) */
  private readonly connections = new Map<string, Imap[]>();

  constructor(
    private readonly crypto: CryptoService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(EmailRaw.name) private readonly emailRawModel: Model<EmailRawDocument>,
    @InjectQueue(QUEUES.CLASSIFICATION) private readonly classificationQueue: Queue,
  ) {}

  // ── Provider helpers ────────────────────────────────────────────────────────

  getProviderConfig(provider: string): { host: string; port: number } {
    return IMAP_PROVIDERS[provider] ?? IMAP_PROVIDERS.yahoo;
  }

  /** Test connectivity without persisting anything */
  async testConnection(email: string, password: string, provider = 'yahoo'): Promise<void> {
    const { host, port } = this.getProviderConfig(provider);
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: email,
        password,
        host,
        port,
        tls: true,
        tlsOptions: { rejectUnauthorized: true },
        authTimeout: 10000,
      });
      imap.once('ready', () => { imap.end(); resolve(); });
      imap.once('error', (err: Error) => reject(err));
      imap.connect();
    });
  }

  // ── Sync orchestration ──────────────────────────────────────────────────────

  /** Called by the cron scheduler — syncs all active users */
  async syncAllUsers(): Promise<void> {
    const users = await this.userModel.find({
      'imapAccounts.0': { $exists: true },
      isActive: true,
    });

    this.logger.log(`Starting IMAP sync for ${users.length} users`);

    const results = await Promise.allSettled(
      users.map((u) => this.fetchEmailsForUser(u._id.toString())),
    );

    const failures = results.filter((r) => r.status === 'rejected').length;
    if (failures > 0) {
      this.logger.warn(`IMAP sync completed: ${users.length - failures} ok, ${failures} failed`);
    } else {
      this.logger.log(`IMAP sync completed for all ${users.length} users`);
    }
  }

  /** Sync ALL connected accounts for one user */
  async fetchEmailsForUser(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user?.imapAccounts?.length) return;

    await this.userModel.findByIdAndUpdate(userId, { syncStatus: 'syncing' });

    const results = await Promise.allSettled(
      user.imapAccounts.map((account) => this.fetchEmailsForAccount(userId, account)),
    );

    const allOk = results.every((r) => r.status === 'fulfilled');
    await this.userModel.findByIdAndUpdate(userId, {
      syncStatus: allOk ? 'idle' : 'error',
      lastSyncAt: new Date(),
    });
  }

  // ── Per-account sync ────────────────────────────────────────────────────────

  private async fetchEmailsForAccount(userId: string, account: ImapAccount): Promise<void> {
    const password = this.crypto.decrypt(account);
    const { host, port } = this.getProviderConfig(account.provider);

    // Use lastSyncAt with 1-day overlap to avoid missing emails at boundary.
    // For a fresh account (never synced), fetch the last 90 days.
    const sinceDate = account.lastSyncAt
      ? new Date(account.lastSyncAt.getTime() - 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: account.email,
        password,
        host,
        port,
        tls: true,
        tlsOptions: { rejectUnauthorized: true },
        authTimeout: 10000,
      });

      // Register in the active-connections map for graceful shutdown
      const userConns = this.connections.get(userId) ?? [];
      userConns.push(imap);
      this.connections.set(userId, userConns);

      const removeConn = () => {
        const conns = this.connections.get(userId) ?? [];
        const idx = conns.indexOf(imap);
        if (idx >= 0) conns.splice(idx, 1);
      };

      imap.once('ready', () => {
        this.doSync(imap, userId, account, sinceDate)
          .then(() => { removeConn(); resolve(); })
          .catch((err: Error) => { removeConn(); reject(err); });
      });

      imap.once('error', (err: Error) => {
        this.logger.error(`IMAP connection error for ${account.email}: ${err.message}`);
        removeConn();
        reject(err);
      });

      imap.once('end', removeConn);
      imap.connect();
    });
  }

  private doSync(
    imap: Imap,
    userId: string,
    account: ImapAccount,
    sinceDate: Date,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      imap.openBox('INBOX', false, (openErr) => {
        if (openErr) { imap.end(); return reject(openErr); }

        const since = formatImapDate(sinceDate);
        // Fetch ALL emails (not just UNSEEN) from the given date window
        imap.search(['SINCE', since], (searchErr, uids) => {
          if (searchErr) { imap.end(); return reject(searchErr); }

          if (!uids?.length) {
            this.logger.log(`No emails found for ${account.email} since ${since}`);
            imap.end();
            this.updateAccountLastSync(userId, account.email).catch(() => {});
            return resolve();
          }

          this.logger.log(
            `[${account.email}] Found ${uids.length} email(s) since ${since}`,
          );

          const fetch = imap.fetch(uids, { bodies: '', markSeen: false });
          const tasks: Promise<void>[] = [];

          fetch.on('message', (msg) => {
            let raw = '';
            msg.on('body', (stream) => {
              stream.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
            });

            const task = new Promise<void>((done) => {
              msg.once('end', () => {
                this.processRawEmail(raw, userId)
                  .catch((e) =>
                    this.logger.error(`Email process error: ${(e as Error).message}`),
                  )
                  .finally(done);
              });
            });
            tasks.push(task);
          });

          fetch.once('error', (e) =>
            this.logger.error(`Fetch error for ${account.email}: ${e.message}`),
          );

          fetch.once('end', async () => {
            // Wait for all email processing to finish before closing the connection
            await Promise.allSettled(tasks);
            await this.updateAccountLastSync(userId, account.email).catch(() => {});
            imap.end();
            resolve();
          });
        });
      });
    });
  }

  // ── Per-email processing ────────────────────────────────────────────────────

  private async processRawEmail(rawEmail: string, userId: string): Promise<void> {
    const parsed = await simpleParser(rawEmail);
    const messageId =
      parsed.messageId ?? `generated-${Date.now()}-${Math.random()}`;
    const from = parsed.from?.text ?? '';
    const subject = parsed.subject ?? '';
    const bodyText = parsed.text?.slice(0, 10240) ?? '';
    const bodyHash = crypto.createHash('sha256').update(bodyText).digest('hex');

    // Pre-filter: skip clearly non-bank emails to reduce AI costs
    if (!isLikelyBankEmail(from, subject)) {
      this.logger.debug(`Pre-filter skip: "${subject}" from ${from}`);
      return;
    }

    // Skip emails already fully processed (avoid duplicate AI pipeline runs)
    const existing = await this.emailRawModel.findOne({ userId, messageId });
    if (existing?.processed) return;

    // Upsert — only inserts on first encounter
    const emailDoc = await this.emailRawModel.findOneAndUpdate(
      { userId, messageId },
      {
        $setOnInsert: {
          userId,
          messageId,
          subject,
          from,
          receivedAt: parsed.date ?? new Date(),
          bodyText,
          bodyHtml: parsed.html ? parsed.html.slice(0, 51200) : '',
          bodyHash,
          status: 'pending',
          processed: false,
        },
      },
      { upsert: true, new: true },
    );

    if (!emailDoc || existing) return; // Already existed → already queued

    // Enqueue for AI classification
    await this.classificationQueue.add(
      'classify',
      {
        userId,
        messageId,
        jobId: messageId,
        emailRawId: (emailDoc._id as { toString(): string }).toString(),
      },
      { ...QUEUE_DEFAULT_JOB_OPTIONS, jobId: `classify-${messageId}` },
    );

    this.logger.debug(`Queued classification for ${messageId}`);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async updateAccountLastSync(
    userId: string,
    accountEmail: string,
  ): Promise<void> {
    await this.userModel.findOneAndUpdate(
      { _id: userId, 'imapAccounts.email': accountEmail },
      { $set: { 'imapAccounts.$.lastSyncAt': new Date() } },
    );
  }

  // ── Graceful shutdown ───────────────────────────────────────────────────────

  onApplicationShutdown() {
    for (const [userId, imaps] of this.connections) {
      for (const imap of imaps) {
        try { imap.end(); } catch { /* ignore */ }
      }
      this.connections.delete(userId);
    }
  }
}
