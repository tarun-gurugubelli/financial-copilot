import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import * as crypto from 'crypto';
import { CryptoService } from '../../common/crypto/crypto.service';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { EmailRaw, EmailRawDocument } from '../../database/schemas/email-raw.schema';
import { QUEUES, QUEUE_DEFAULT_JOB_OPTIONS } from '../../queues/queue.constants';

@Injectable()
export class ImapService implements OnApplicationShutdown {
  private readonly logger = new Logger(ImapService.name);
  private readonly connections = new Map<string, Imap>();

  constructor(
    private readonly crypto: CryptoService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(EmailRaw.name) private readonly emailRawModel: Model<EmailRawDocument>,
    @InjectQueue(QUEUES.EMAIL_FETCH) private readonly emailFetchQueue: Queue,
  ) {}

  async testConnection(email: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: email,
        password,
        host: 'imap.mail.yahoo.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: true },
        authTimeout: 10000,
      });
      imap.once('ready', () => { imap.end(); resolve(); });
      imap.once('error', (err: Error) => reject(err));
      imap.connect();
    });
  }

  async dispatchSyncJobs(): Promise<void> {
    const users = await this.userModel.find({
      imapCredentials: { $ne: null },
      isActive: true,
    });

    for (const user of users) {
      await this.emailFetchQueue.add(
        'sync',
        { userId: user._id.toString(), messageId: `sync-${user._id}`, jobId: `sync-${user._id}` },
        { ...QUEUE_DEFAULT_JOB_OPTIONS, jobId: `sync-${user._id.toString()}` },
      );
    }
    this.logger.log(`Dispatched sync jobs for ${users.length} users`);
  }

  async fetchEmailsForUser(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user?.imapCredentials) return;

    const password = this.crypto.decrypt(user.imapCredentials);
    const email = user.imapCredentials.email;

    return new Promise((resolve, reject) => {
      let backoffMs = 5000;
      const MAX_BACKOFF = 5 * 60 * 1000;

      const connect = () => {
        const imap = new Imap({
          user: email,
          password,
          host: 'imap.mail.yahoo.com',
          port: 993,
          tls: true,
          tlsOptions: { rejectUnauthorized: true },
        });
        this.connections.set(userId, imap);

        imap.once('ready', () => this.onImapReady(imap, userId, resolve, reject));
        imap.once('error', (err: Error) => {
          this.logger.error(`IMAP error for user ${userId}: ${err.message}`);
          const delay = Math.min(backoffMs, MAX_BACKOFF);
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
          setTimeout(connect, delay);
        });
        imap.once('end', () => {
          this.connections.delete(userId);
          resolve();
        });
        imap.connect();
      };

      connect();
    });
  }

  private onImapReady(
    imap: Imap,
    userId: string,
    resolve: () => void,
    reject: (err: Error) => void,
  ) {
    imap.openBox('INBOX', false, (err, box) => {
      if (err) { imap.end(); return reject(err); }

      imap.search(['UNSEEN'], (err, uids) => {
        if (err || !uids?.length) { imap.end(); return resolve(); }

        const fetch = imap.fetch(uids, { bodies: '', markSeen: false });

        fetch.on('message', (msg) => {
          let rawEmail = '';
          msg.on('body', (stream) => {
            stream.on('data', (chunk: Buffer) => (rawEmail += chunk.toString('utf8')));
          });
          msg.once('end', async () => {
            try {
              const parsed = await simpleParser(rawEmail);
              const messageId = parsed.messageId ?? `generated-${Date.now()}`;
              const bodyText = parsed.text?.slice(0, 10240) ?? '';
              const bodyHash = crypto.createHash('sha256').update(bodyText).digest('hex');

              await this.emailRawModel.findOneAndUpdate(
                { userId, messageId },
                {
                  $setOnInsert: {
                    userId,
                    messageId,
                    subject: parsed.subject ?? '',
                    from: parsed.from?.text ?? '',
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

              await this.emailFetchQueue.add(
                'process',
                { userId, messageId, jobId: messageId },
                { ...QUEUE_DEFAULT_JOB_OPTIONS, jobId: messageId },
              );
            } catch (e) {
              this.logger.error(`Failed to parse email: ${(e as Error).message}`);
            }
          });
        });

        fetch.once('error', (err) => this.logger.error(`Fetch error: ${err.message}`));
        fetch.once('end', () => imap.end());
      });
    });
  }

  onApplicationShutdown() {
    for (const [userId, imap] of this.connections) {
      try { imap.end(); } catch {}
      this.connections.delete(userId);
    }
  }
}
