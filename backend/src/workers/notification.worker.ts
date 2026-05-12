import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from '../database/schemas/notification.schema';
import { Transaction, TransactionDocument } from '../database/schemas/transaction.schema';
import { QUEUES } from '../queues/queue.constants';
import { JobPayload } from '../queues/job-payload.interface';
import { SocketGateway, WS_EVENTS } from '../common/gateway/socket.gateway';

const CONFIDENCE_THRESHOLD = 0.7;

@Processor(QUEUES.NOTIFICATION)
export class NotificationWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
    private readonly gateway: SocketGateway,
  ) {
    super();
  }

  async process(job: Job<JobPayload>): Promise<void> {
    const { userId, emailRawId, extractionResult } = job.data;

    const userObjId = new Types.ObjectId(userId);

    // ── Extraction-failed path ──────────────────────────────────────────────
    if (!extractionResult || extractionResult.confidence < CONFIDENCE_THRESHOLD) {
      const notification = await this.notificationModel.create({
        userId: userObjId,
        type: 'extraction_failed',
        title: 'Could not extract transaction',
        body: 'We received a bank email but couldn\'t extract transaction details with confidence. You may want to add it manually.',
        severity: 'warning',
        relatedId: emailRawId ? new Types.ObjectId(emailRawId) : null,
        relatedCollection: 'emailraws',
      });

      this.gateway.emitToUser(userId, WS_EVENTS.EXTRACTION_FAILED, {
        notificationId: (notification._id as Types.ObjectId).toString(),
        title: notification.title,
        body: notification.body,
        severity: notification.severity,
        timestamp: (notification as { createdAt?: Date }).createdAt,
      });

      this.logger.log(`[${job.data.messageId}] extraction_failed notification created + emitted`);
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

    const notification = await this.notificationModel.create({
      userId: userObjId,
      type: 'transaction_new',
      title: `₹${amountFormatted} at ${extractionResult.merchant}`,
      body: `New transaction on card ending ${cardSuffix}`,
      severity: 'info',
      relatedId: transaction ? (transaction._id as Types.ObjectId) : null,
      relatedCollection: 'transactions',
    });

    // Emit real-time events
    this.gateway.emitToUser(userId, WS_EVENTS.TRANSACTION_NEW, {
      transactionId: transaction ? (transaction._id as Types.ObjectId).toString() : null,
      merchant: extractionResult.merchant,
      amount: extractionResult.amount,
      cardLast4: cardSuffix,
      timestamp: extractionResult.timestamp,
      notificationId: (notification._id as Types.ObjectId).toString(),
    });

    this.gateway.emitToUser(userId, 'notification.new', {
      id: (notification._id as Types.ObjectId).toString(),
      type: notification.type,
      title: notification.title,
      body: notification.body,
      severity: notification.severity,
      createdAt: (notification as { createdAt?: Date }).createdAt,
    });

    this.logger.log(
      `[${job.data.messageId}] transaction_new notification: ₹${amountFormatted} @ ${extractionResult.merchant}`,
    );
  }
}
