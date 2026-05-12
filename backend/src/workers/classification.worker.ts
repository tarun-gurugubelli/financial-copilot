import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job, Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { EmailRaw, EmailRawDocument } from '../database/schemas/email-raw.schema';
import { QUEUES, QUEUE_DEFAULT_JOB_OPTIONS } from '../queues/queue.constants';
import { JobPayload } from '../queues/job-payload.interface';
import { OpenAiService } from '../common/openai/openai.service';
import { sanitizeForPrompt } from '../common/utils/sanitize';

const EMAIL_TYPES = ['transaction', 'otp', 'statement', 'reward', 'spam'] as const;
type EmailType = (typeof EMAIL_TYPES)[number];

const SYSTEM_PROMPT = `You are an email classifier for an Indian banking assistant.
Classify the email into exactly one type and return JSON only.

Types:
- transaction: ANY email about money movement — credit/debit card charge, UPI payment, bank transfer, merchant debit/credit alert, amount debited/credited. Look for key phrases: "debited", "credited", "spent", "UPI txn", "Rs.", "INR", "amount debited", "transaction alert", "card used", "payment successful".
- otp: one-time password, verification code, login OTP, 2FA code
- statement: monthly account/card statement, account summary, passbook update
- reward: reward points earned, cashback credited, milestone bonus
- spam: promotional offers, newsletters, marketing campaigns, account feature updates, charge notices, regulatory updates, KYC/CKYC notifications, app password alerts — anything NOT involving an actual money movement

CRITICAL RULES:
1. If the email mentions a specific rupee amount being debited/credited from an account or card, classify as "transaction" regardless of the sender domain.
2. Subjects like "You have done a UPI txn", "INR XXXX spent on credit card", "Rs.XXXX debited", "transaction alert" are ALWAYS "transaction".
3. Indian bank senders (hdfcbank, axisbank, icicibank, sbi, kotakbank, yesbank, indusind) sending amount alerts = "transaction".
4. "Changes in charges", "Important Update", "CKYC", "KYC" = "spam".

Return: {"email_type": "<type>", "confidence": <0.0-1.0>}`;

@Processor(QUEUES.CLASSIFICATION)
export class ClassificationWorker extends WorkerHost {
  private readonly logger = new Logger(ClassificationWorker.name);

  constructor(
    @InjectModel(EmailRaw.name) private readonly emailRawModel: Model<EmailRawDocument>,
    @InjectQueue(QUEUES.EXTRACTION) private readonly extractionQueue: Queue,
    private readonly openAi: OpenAiService,
  ) {
    super();
  }

  async process(job: Job<JobPayload>): Promise<void> {
    const { userId, messageId, emailRawId } = job.data;

    const emailRaw = emailRawId
      ? await this.emailRawModel.findById(emailRawId)
      : await this.emailRawModel.findOne({ userId, messageId });

    if (!emailRaw || emailRaw.processed) return;

    const subject = sanitizeForPrompt(emailRaw.subject ?? '', 200);
    const body = sanitizeForPrompt(emailRaw.bodyText ?? '', 3000);

    let emailType: EmailType = 'spam';

    try {
      const { content } = await this.openAi.chat(
        'gpt-4o-mini',
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Subject: ${subject}\n\nBody:\n${body}` },
        ],
        { temperature: 0, max_tokens: 60 },
      );

      const parsed = JSON.parse(content) as { email_type?: string; confidence?: number };
      if (EMAIL_TYPES.includes(parsed.email_type as EmailType)) {
        emailType = parsed.email_type as EmailType;
      }
    } catch (err) {
      this.logger.error(`Classification failed for ${messageId}: ${(err as Error).message}`);
    }

    if (emailType !== 'transaction') {
      await this.emailRawModel.findByIdAndUpdate(emailRaw._id, {
        emailType,
        status: 'processed',
        processed: true,
        processedAt: new Date(),
      });
      this.logger.debug(`Classified ${messageId} → ${emailType}`);
      return;
    }

    // Mark email type and enqueue extraction
    await this.emailRawModel.findByIdAndUpdate(emailRaw._id, { emailType: 'transaction' });

    const payload: JobPayload = {
      ...job.data,
      emailRawId: (emailRaw._id as Types.ObjectId).toString(),
      emailType: 'transaction',
    };

    // Append runId so reprocess runs never collide with previous completed jobs
    const runId = job.data.runId;
    const extractJobId = runId ? `extract-${messageId}-r${runId}` : `extract-${messageId}`;

    await this.extractionQueue.add('extract', payload, {
      ...QUEUE_DEFAULT_JOB_OPTIONS,
      jobId: extractJobId,
    });

    this.logger.log(`[${messageId}] → transaction → enqueued extraction`);
  }
}
