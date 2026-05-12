import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job, Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { EmailRaw, EmailRawDocument } from '../database/schemas/email-raw.schema';
import { Transaction, TransactionDocument } from '../database/schemas/transaction.schema';
import { Card, CardDocument } from '../database/schemas/card.schema';
import { QUEUES, QUEUE_DEFAULT_JOB_OPTIONS } from '../queues/queue.constants';
import { ExtractionResult, JobPayload } from '../queues/job-payload.interface';
import { OpenAiService } from '../common/openai/openai.service';
import { sanitizeForPrompt } from '../common/utils/sanitize';

const CONFIDENCE_THRESHOLD = 0.7;

/** Strip HTML to readable plain text for emails that have no text part. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const SYSTEM_PROMPT = `You are a financial transaction extractor specializing in Indian banking emails.
Extract the transaction details and return valid JSON matching this schema exactly:
{
  "amount": <positive number — required, strip commas e.g. 1234.56 not "₹1,234.56">,
  "currency": "INR",
  "merchant": "<merchant / payee / store name — required, clean name only>",
  "bankName": "<issuing bank — e.g. HDFC Bank | Axis Bank | ICICI Bank | IDFC First Bank | Yes Bank | Kotak Bank | SBI | IndusInd Bank>",
  "card_last4": "<exactly 4 digits — or null if not found>",
  "transactionType": "<UPI | POS | Online | ATM | null>",
  "timestamp": "<ISO 8601 datetime — or null>",
  "location": "<city or location — or null>",
  "isEmi": <boolean>,
  "emiDetails": null | {"totalAmount": <number>, "tenure": <months>, "monthlyAmount": <number>},
  "confidence": <0.0–1.0>
}

Common Indian bank email formats you will see:

HDFC Bank (Credit Card):
  "INR 1,234.00 has been spent on your HDFC Bank Credit Card XX1234 at MERCHANT on DD/MM/YY."
  "INR 1,234.00 spent on Credit Card ending 1234. Merchant: MERCHANT."

HDFC Bank (RuPay Credit Card):
  "Rs.1,234.00 is debited from your HDFC Bank RuPay Credit Card ending 1234 on MM/DD/YYYY at MERCHANT."
  "Rs.1,234.00 is debited from your HDFC Bank RuPay Credit Card ending 1234. Available limit: Rs.45,000."

HDFC Bank (UPI InstaAlert):
  "You have done a UPI txn. Check details!\nAmount: Rs.1,234.00 | To: MERCHANT | From A/c: XXXX1234"

Axis Bank:
  "Your Axis Bank Credit Card XX1234 has been used for Rs.1,234.00 at MERCHANT on DD MMM YYYY."
  "Rs.1,234.00 has been debited from your Axis Bank A/c ending 1234 via UPI."
  "INR 1,234 spent on credit card no. XX1234. Merchant: MERCHANT."

ICICI Bank:
  "Your ICICI Bank Credit Card XX1234 has been used for a transaction of Rs 1,234.00 at MERCHANT."
  "Rs.1,234.00 has been debited from your ICICI Bank account ending 1234."

IDFC First Bank:
  "Rs 1,234 has been debited from your IDFC FIRST Bank Account ending 1234 on DD-MM-YYYY."

Yes Bank:
  "Rs.1,234.00 debited on YES BANK Credit Card XX1234 at MERCHANT on DD-MM-YYYY."

Kotak Bank:
  "A transaction of Rs.1,234.00 has been made on your Kotak Credit Card ending 1234 at MERCHANT."

IndusInd Bank:
  "INR 1,234.00 has been debited from your IndusInd Bank Credit Card ending 1234 at MERCHANT."

UPI transactions (generic):
  "You have done a UPI txn. Amount: Rs.1,234.00 | To: MERCHANT | From a/c: XX1234 | UPI Ref: 123456789"

Rules:
- amount: positive number, strip ₹ and commas (e.g. 1,234.56 → 1234.56)
- merchant: extract only the merchant/payee name — strip bank name, card number, date suffixes
- For UPI, merchant is the recipient UPA ID display name or VPA description
- bankName: identify from context (e.g. "HDFC Bank Credit Card" → "HDFC Bank")
- card_last4: 4-digit card suffix from phrases like "ending 1234" or "XX1234" or "card no. XXXX1234"
- confidence 1.0 = all required fields present; deduct for each missing field`;

@Processor(QUEUES.EXTRACTION)
export class ExtractionWorker extends WorkerHost {
  private readonly logger = new Logger(ExtractionWorker.name);

  constructor(
    @InjectModel(EmailRaw.name) private readonly emailRawModel: Model<EmailRawDocument>,
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Card.name) private readonly cardModel: Model<CardDocument>,
    @InjectQueue(QUEUES.CATEGORIZATION) private readonly categorizationQueue: Queue,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notificationQueue: Queue,
    private readonly openAi: OpenAiService,
  ) {
    super();
  }

  async process(job: Job<JobPayload>): Promise<void> {
    const { userId, messageId, emailRawId } = job.data;

    const emailRaw = emailRawId
      ? await this.emailRawModel.findById(emailRawId)
      : await this.emailRawModel.findOne({ userId, messageId });

    if (!emailRaw) return;

    const subject = sanitizeForPrompt(emailRaw.subject ?? '', 200);
    // Fall back to stripping HTML when the plain-text part is absent (e.g. HDFC InstaAlerts)
    const rawBody = (emailRaw.bodyText ?? '').trim() || htmlToText(emailRaw.bodyHtml ?? '');
    const body = sanitizeForPrompt(rawBody, 4000);

    let extraction: ExtractionResult | null = null;
    let totalTokens = 0;

    try {
      const { content, inputTokens, outputTokens } = await this.openAi.chat(
        'gpt-4o',
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Subject: ${subject}\n\nBody:\n${body}` },
        ],
        { temperature: 0, max_tokens: 500 },
      );
      totalTokens = inputTokens + outputTokens;

      const raw = JSON.parse(content) as Record<string, unknown>;

      // Normalise amount — strip commas from string amounts just in case the
      // model returns "1,234.56" despite instructions
      const rawAmount =
        typeof raw.amount === 'string'
          ? parseFloat((raw.amount as string).replace(/,/g, ''))
          : (raw.amount as number);

      if (typeof rawAmount === 'number' && rawAmount > 0 && typeof raw.merchant === 'string') {
        extraction = {
          amount: rawAmount,
          currency: typeof raw.currency === 'string' ? raw.currency : 'INR',
          merchant: raw.merchant,
          bankName: typeof raw.bankName === 'string' ? raw.bankName : undefined,
          transactionType:
            raw.transactionType === 'UPI' ||
            raw.transactionType === 'POS' ||
            raw.transactionType === 'Online' ||
            raw.transactionType === 'ATM'
              ? (raw.transactionType as ExtractionResult['transactionType'])
              : null,
          card_last4: typeof raw.card_last4 === 'string' ? raw.card_last4 : null,
          timestamp: raw.timestamp ? new Date(raw.timestamp as string) : emailRaw.receivedAt,
          location: typeof raw.location === 'string' ? raw.location : undefined,
          isEmi: raw.isEmi === true,
          emiDetails:
            raw.emiDetails && typeof raw.emiDetails === 'object'
              ? (raw.emiDetails as ExtractionResult['emiDetails'])
              : undefined,
          confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
        };
      }
    } catch (err) {
      this.logger.error(`Extraction error for ${messageId}: ${(err as Error).message}`);
    }

    const runId = job.data.runId;

    // ── Confidence gate ────────────────────────────────────────────────────────
    if (!extraction || extraction.confidence < CONFIDENCE_THRESHOLD) {
      await this.emailRawModel.findByIdAndUpdate(emailRaw._id, {
        status: 'low_confidence',
        processed: true,
        processedAt: new Date(),
      });

      const notifyFailJobId = runId ? `notify-fail-${messageId}-r${runId}` : `notify-fail-${messageId}`;
      await this.notificationQueue.add(
        'notify',
        { ...job.data, emailRawId: (emailRaw._id as Types.ObjectId).toString() } satisfies JobPayload,
        { ...QUEUE_DEFAULT_JOB_OPTIONS, jobId: notifyFailJobId },
      );

      this.logger.warn(
        `[${messageId}] low confidence (${extraction?.confidence ?? 0}) → extraction_failed`,
      );
      return;
    }

    // ── Find or create card ────────────────────────────────────────────────────
    const last4 = extraction.card_last4 ?? '0000';
    const bankName = extraction.bankName ?? 'Unknown Bank';

    let card = await this.cardModel.findOne({ userId, last4 });
    if (!card) {
      card = await this.cardModel.create({
        userId,
        last4,
        bankName,
        creditLimit: 100000,
        currentBalance: 0,
      });
    } else if (card.bankName === 'Unknown Bank' && bankName !== 'Unknown Bank') {
      // Upgrade the bank name if we now have a better value
      await this.cardModel.findByIdAndUpdate(card._id, { bankName });
      const updated = await this.cardModel.findById(card._id);
      if (updated) card = updated;
    }

    // card is guaranteed non-null at this point (created above if it was missing)
    if (!card) throw new Error(`Failed to resolve card for last4=${last4}`);

    // ── Create transaction ────────────────────────────────────────────────────
    const transaction = await this.transactionModel.create({
      userId,
      cardId: card._id,
      amount: extraction.amount,
      currency: extraction.currency,
      merchant: extraction.merchant,
      category: 'Other',
      subcategory: '',
      status: 'extracted',
      source: 'imap',
      timestamp: extraction.timestamp ?? emailRaw.receivedAt,
      location: extraction.location ?? '',
      isEmi: extraction.isEmi,
      emiDetails: extraction.emiDetails ?? null,
      extractionConfidence: extraction.confidence,
      emailRawId: emailRaw._id,
      openaiTokensUsed: totalTokens,
    });

    // Update card running balance
    await this.cardModel.findByIdAndUpdate(card._id, {
      $inc: { currentBalance: extraction.amount },
    });

    // Mark email processed
    await this.emailRawModel.findByIdAndUpdate(emailRaw._id, {
      status: 'processed',
      processed: true,
      processedAt: new Date(),
    });

    // Enqueue categorization
    const payload: JobPayload = {
      ...job.data,
      emailRawId: (emailRaw._id as Types.ObjectId).toString(),
      extractionResult: extraction,
    };

    const categorizeJobId = runId ? `categorize-${messageId}-r${runId}` : `categorize-${messageId}`;
    await this.categorizationQueue.add('categorize', payload, {
      ...QUEUE_DEFAULT_JOB_OPTIONS,
      jobId: categorizeJobId,
    });

    this.logger.log(
      `[${messageId}] ₹${extraction.amount} @ ${extraction.merchant} (${bankName} ••${last4}) → tx ${(transaction._id as Types.ObjectId).toString()}`,
    );
  }
}
