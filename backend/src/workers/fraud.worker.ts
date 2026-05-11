/**
 * Phase 2 passthrough — all transactions pass with fraudScore = 0.
 * Real GPT-4o fraud detection replaces this in Phase 4.
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job, Queue } from 'bullmq';
import { Model } from 'mongoose';
import { Transaction, TransactionDocument } from '../database/schemas/transaction.schema';
import { QUEUES, QUEUE_DEFAULT_JOB_OPTIONS } from '../queues/queue.constants';
import { FraudResult, JobPayload } from '../queues/job-payload.interface';

@Processor(QUEUES.FRAUD)
export class FraudWorker extends WorkerHost {
  private readonly logger = new Logger(FraudWorker.name);

  constructor(
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notificationQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<JobPayload>): Promise<void> {
    const { userId, messageId, extractionResult } = job.data;
    if (!extractionResult) return;

    // Phase 2 passthrough — zero fraud score
    const fraudResult: FraudResult = { fraudScore: 0, fraudFlags: [], fraudReasoning: '' };

    // Stamp the transaction with fraud result
    await this.transactionModel.findOneAndUpdate(
      { userId, merchant: extractionResult.merchant, amount: extractionResult.amount, status: 'categorized' },
      { fraudScore: 0, fraudFlags: [], fraudReasoning: '' },
      { sort: { createdAt: -1 } },
    );

    await this.notificationQueue.add(
      'notify',
      { ...job.data, fraudResult } satisfies JobPayload,
      { ...QUEUE_DEFAULT_JOB_OPTIONS, jobId: `notify-${messageId}` },
    );

    this.logger.debug(`[${messageId}] fraud passthrough → notification enqueued`);
  }
}
