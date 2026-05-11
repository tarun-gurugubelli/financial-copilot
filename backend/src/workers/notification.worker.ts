import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from '../database/schemas/notification.schema';
import { Transaction, TransactionDocument } from '../database/schemas/transaction.schema';
import { QUEUES } from '../queues/queue.constants';
import { JobPayload } from '../queues/job-payload.interface';

const CONFIDENCE_THRESHOLD = 0.7;

@Processor(QUEUES.NOTIFICATION)
export class NotificationWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
  ) {
    super();
  }

  async process(job: Job<JobPayload>): Promise<void> {
    const { userId, emailRawId, extractionResult } = job.data;

    const userObjId = new Types.ObjectId(userId);

    // ── Extraction-failed path ──────────────────────────────────────────────
    if (!extractionResult || extractionResult.confidence < CONFIDENCE_THRESHOLD) {
      await this.notificationModel.create({
        userId: userObjId,
        type: 'extraction_failed',
        title: 'Could not extract transaction',
        body: 'We received a bank email but couldn\'t extract transaction details with confidence. You may want to add it manually.',
        severity: 'warning',
        relatedId: emailRawId ? new Types.ObjectId(emailRawId) : null,
        relatedCollection: 'emailraws',
      });
      this.logger.log(`[${job.data.messageId}] extraction_failed notification created`);
      return;
    }

    // ── Successful transaction path ─────────────────────────────────────────
    const transaction = await this.transactionModel.findOne(
      { userId, merchant: extractionResult.merchant, amount: extractionResult.amount },
      {},
      { sort: { createdAt: -1 } },
    );

    const amountFormatted = extractionResult.amount.toLocaleString('en-IN');
    const cardSuffix = extractionResult.card_last4 ?? '****';

    await this.notificationModel.create({
      userId: userObjId,
      type: 'transaction_new',
      title: `₹${amountFormatted} at ${extractionResult.merchant}`,
      body: `New transaction on card ending ${cardSuffix}`,
      severity: 'info',
      relatedId: transaction ? (transaction._id as Types.ObjectId) : null,
      relatedCollection: 'transactions',
    });

    this.logger.log(
      `[${job.data.messageId}] transaction_new notification: ₹${amountFormatted} @ ${extractionResult.merchant}`,
    );
  }
}
