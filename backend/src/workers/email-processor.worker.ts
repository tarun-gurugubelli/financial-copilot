/**
 * Phase 1 scaffolding worker — regex-based extraction.
 * This entire file is replaced by the LangGraph AI pipeline in Phase 2.
 * Do not build on this code; it exists only to unblock the UI.
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EmailRaw, EmailRawDocument } from '../database/schemas/email-raw.schema';
import { Transaction, TransactionDocument } from '../database/schemas/transaction.schema';
import { Card, CardDocument } from '../database/schemas/card.schema';
import { QUEUES } from '../queues/queue.constants';
import { JobPayload } from '../queues/job-payload.interface';

const AMOUNT_REGEX = /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
const CARD_REGEX = /(?:card|ending|XX|xx)\s*[*Xx]{0,4}(\d{4})/i;
const MERCHANT_REGEX = /(?:at|merchant|store)\s+([A-Za-z0-9 &'\-]{2,40})/i;

@Processor(QUEUES.EMAIL_FETCH)
export class EmailProcessorWorker extends WorkerHost {
  private readonly logger = new Logger(EmailProcessorWorker.name);

  constructor(
    @InjectModel(EmailRaw.name) private readonly emailRawModel: Model<EmailRawDocument>,
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Card.name) private readonly cardModel: Model<CardDocument>,
  ) {
    super();
  }

  async process(job: Job<JobPayload>): Promise<void> {
    if (job.name === 'sync') return; // dispatch jobs, not process

    const { userId, messageId } = job.data;

    const emailRaw = await this.emailRawModel.findOne({ userId, messageId });
    if (!emailRaw || emailRaw.processed) return;

    const text = emailRaw.bodyText ?? '';

    const amountMatch = AMOUNT_REGEX.exec(text);
    const cardMatch = CARD_REGEX.exec(text);
    const merchantMatch = MERCHANT_REGEX.exec(text);

    if (!amountMatch) {
      await this.emailRawModel.findByIdAndUpdate(emailRaw._id, {
        status: 'processed',
        processed: true,
        processedAt: new Date(),
        emailType: 'spam',
      });
      return;
    }

    const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    const last4 = cardMatch?.[1] ?? '0000';
    const merchant = merchantMatch?.[1]?.trim() ?? 'Unknown Merchant';

    let card = await this.cardModel.findOne({ userId, last4 });
    if (!card) {
      card = await this.cardModel.create({
        userId,
        last4,
        bankName: 'Unknown Bank',
        creditLimit: 100000,
        currentBalance: 0,
      });
    }

    await this.transactionModel.create({
      userId,
      cardId: card._id,
      amount,
      currency: 'INR',
      merchant,
      category: 'Other',
      status: 'extracted',
      source: 'imap',
      timestamp: emailRaw.receivedAt,
      emailRawId: emailRaw._id,
      extractionConfidence: 0.5,
      fraudScore: 0,
      fraudFlags: [],
    });

    await this.cardModel.findByIdAndUpdate(card._id, {
      $inc: { currentBalance: amount },
    });

    await this.emailRawModel.findByIdAndUpdate(emailRaw._id, {
      status: 'processed',
      processed: true,
      processedAt: new Date(),
      emailType: 'transaction',
    });

    this.logger.log(`Phase1 extraction: ₹${amount} at ${merchant} for user ${userId}`);
  }
}
