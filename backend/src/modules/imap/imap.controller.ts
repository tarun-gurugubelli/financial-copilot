import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ImapService, IMAP_PROVIDERS } from './imap.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { EmailRaw, EmailRawDocument } from '../../database/schemas/email-raw.schema';
import { Transaction, TransactionDocument } from '../../database/schemas/transaction.schema';
import { Card, CardDocument } from '../../database/schemas/card.schema';
import { QUEUES, QUEUE_DEFAULT_JOB_OPTIONS } from '../../queues/queue.constants';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class ConnectImapDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(4)
  appPassword: string;

  @IsOptional()
  @IsIn(['yahoo', 'gmail', 'outlook'])
  provider?: 'yahoo' | 'gmail' | 'outlook';
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('imap')
@UseGuards(JwtAuthGuard)
export class ImapController {
  private readonly logger = new Logger(ImapController.name);

  constructor(
    private readonly imapService: ImapService,
    private readonly crypto: CryptoService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(EmailRaw.name) private readonly emailRawModel: Model<EmailRawDocument>,
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Card.name) private readonly cardModel: Model<CardDocument>,
    @InjectQueue(QUEUES.CLASSIFICATION) private readonly classificationQueue: Queue,
  ) {}

  /**
   * GET /api/imap/accounts
   * Returns the list of connected email accounts (no credentials).
   */
  @Get('accounts')
  async listAccounts(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    const user = await this.userModel.findById(userId).select('imapAccounts syncStatus lastSyncAt');
    const accounts = (user?.imapAccounts ?? []).map((a) => ({
      email: a.email,
      provider: a.provider,
      lastSyncAt: a.lastSyncAt,
    }));
    return { accounts, syncStatus: user?.syncStatus, lastSyncAt: user?.lastSyncAt };
  }

  /**
   * POST /api/imap/connect
   * Test connectivity, then add (or update) an account.
   * If the email is already in the list, the stored password is updated.
   */
  @Post('connect')
  async connect(@Body() dto: ConnectImapDto, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    const providerName = dto.provider ?? 'yahoo';
    const { host } = IMAP_PROVIDERS[providerName];

    // Verify credentials before saving
    try {
      await this.imapService.testConnection(dto.email, dto.appPassword, providerName);
    } catch {
      throw new BadRequestException(
        `Could not connect to ${providerName} IMAP. Check your email and App Password.`,
      );
    }

    const encrypted = this.crypto.encrypt(dto.appPassword);
    const accountEntry = {
      email: dto.email.toLowerCase(),
      provider: providerName,
      host,
      ...encrypted,
      lastSyncAt: null,
    };

    const user = await this.userModel.findById(userId).select('imapAccounts');
    const existingIdx = user?.imapAccounts?.findIndex(
      (a) => a.email.toLowerCase() === dto.email.toLowerCase(),
    );

    if (existingIdx !== undefined && existingIdx >= 0) {
      // Update the existing entry's encrypted password
      await this.userModel.findByIdAndUpdate(userId, {
        [`imapAccounts.${existingIdx}.iv`]: encrypted.iv,
        [`imapAccounts.${existingIdx}.authTag`]: encrypted.authTag,
        [`imapAccounts.${existingIdx}.ciphertext`]: encrypted.ciphertext,
        syncStatus: 'syncing',
      });
    } else {
      // Append new account
      await this.userModel.findByIdAndUpdate(userId, {
        $push: { imapAccounts: accountEntry },
        syncStatus: 'syncing',
      });
    }

    // Trigger initial sync immediately (fire-and-forget)
    this.imapService.fetchEmailsForUser(userId).catch(() => {});

    return { message: 'Connected successfully', syncStatus: 'syncing', provider: providerName };
  }

  /**
   * DELETE /api/imap/accounts/:email
   * Removes a connected email account.
   */
  @Delete('accounts/:email')
  async disconnectAccount(@Req() req: Request, @Param('email') email: string) {
    const { userId } = req.user as { userId: string };
    const decodedEmail = decodeURIComponent(email).toLowerCase();

    const user = await this.userModel.findById(userId).select('imapAccounts');
    const exists = user?.imapAccounts?.some(
      (a) => a.email.toLowerCase() === decodedEmail,
    );
    if (!exists) throw new NotFoundException(`Account ${decodedEmail} not found`);

    await this.userModel.findByIdAndUpdate(userId, {
      $pull: { imapAccounts: { email: decodedEmail } },
    });

    return { message: 'Account disconnected', email: decodedEmail };
  }

  /**
   * GET /api/imap/pipeline-status
   *
   * Returns the count of pending vs. completed email_raw documents for the
   * calling user. Used by the frontend to track re-process pipeline progress
   * without needing a WebSocket.
   */
  @Get('pipeline-status')
  async pipelineStatus(@Req() req: Request) {
    const { userId } = req.user as { userId: string };

    // Match both string and ObjectId forms (Phase-1 legacy vs. current schema)
    const userFilter = {
      $or: [
        { userId },
        { userId: new Types.ObjectId(userId) },
      ],
    };

    const [total, done] = await Promise.all([
      this.emailRawModel.countDocuments(userFilter),
      this.emailRawModel.countDocuments({
        $and: [userFilter, { processed: true }],
      }),
    ]);

    return { total, done, pending: total - done };
  }

  /**
   * POST /api/imap/sync
   * Manually trigger a sync for the authenticated user.
   * Optional body: { from: "YYYY-MM-DD" } to fetch emails from a specific date.
   */
  @Post('sync')
  async sync(@Req() req: Request, @Body() body: { from?: string }) {
    const { userId } = req.user as { userId: string };

    const user = await this.userModel.findById(userId).select('imapAccounts');
    if (!user?.imapAccounts?.length) {
      throw new BadRequestException('No email accounts connected. Add an account first.');
    }

    const sinceOverride = body?.from ? new Date(body.from) : undefined;

    // Fire-and-forget — client polls syncStatus
    this.imapService.fetchEmailsForUser(userId, sinceOverride).catch((err: Error) => {
      this.logger.error(`Manual sync error for ${userId}: ${err.message}`);
    });

    return { message: 'Sync started', syncStatus: 'syncing' };
  }

  /**
   * POST /api/imap/reprocess
   *
   * Hard-reset for the calling user:
   *   1. Deletes all extracted transactions (Phase 1 garbage, wrong merchants / cards)
   *   2. Deletes all auto-created cards
   *   3. Resets every email_raw doc to processed=false so the AI pipeline can re-run
   *   4. Re-enqueues every email for classification
   *
   * Safe to call multiple times — jobId deduplication prevents double-processing.
   */
  @Post('reprocess')
  async reprocess(@Req() req: Request) {
    const { userId } = req.user as { userId: string };

    // Match both string userId (Phase-1 legacy) and ObjectId userId (new data)
    // Phase 1 stored userId as a plain string; current schema uses ObjectId.
    // Using $or ensures we catch all documents regardless of storage type.
    const userFilter = {
      $or: [
        { userId: userId },
        { userId: new Types.ObjectId(userId) },
      ],
    };

    // 1. Wipe stale Phase-1 transactions
    const { deletedCount: txDeleted } = await this.transactionModel.deleteMany(userFilter);

    // 2. Wipe auto-created cards (unknown-bank placeholders)
    const { deletedCount: cardDeleted } = await this.cardModel.deleteMany(userFilter);

    // 3. Reset every email_raw so the pipeline treats them as fresh
    await this.emailRawModel.updateMany(
      userFilter,
      { $set: { processed: false, status: 'pending', processedAt: null } },
    );

    // 4. Re-enqueue every stored email for AI classification
    const emails = await this.emailRawModel
      .find(userFilter)
      .select('messageId')
      .lean();

    // Use a runId so every job in the whole pipeline chain gets a unique BullMQ
    // jobId, bypassing duplicate suppression from previously-completed jobs.
    const runId = Date.now();

    let queued = 0;
    for (const email of emails) {
      const msgId = email.messageId as string;
      await this.classificationQueue.add(
        'classify',
        {
          userId,
          messageId: msgId,
          jobId: msgId,
          emailRawId: (email._id as Types.ObjectId).toString(),
          runId,
        },
        {
          ...QUEUE_DEFAULT_JOB_OPTIONS,
          jobId: `classify-${msgId}-r${runId}`,
        },
      );
      queued++;
    }

    // Stamp the time so the UI can show "Last reset at …"
    const now = new Date();
    await this.userModel.findByIdAndUpdate(userId, { lastReprocessAt: now });

    this.logger.log(
      `[reprocess] user=${userId} txDeleted=${txDeleted} cardsDeleted=${cardDeleted} emailsQueued=${queued}`,
    );

    return {
      message: 'Reprocessing started. Transactions and cards will re-appear as emails are analysed.',
      lastReprocessAt: now.toISOString(),
      stats: { txDeleted, cardDeleted, emailsQueued: queued },
    };
  }
}
