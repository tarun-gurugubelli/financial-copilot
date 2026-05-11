import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job, Queue } from 'bullmq';
import { Model } from 'mongoose';
import { Transaction, TransactionDocument } from '../database/schemas/transaction.schema';
import { QUEUES, QUEUE_DEFAULT_JOB_OPTIONS } from '../queues/queue.constants';
import { CategorizationResult, JobPayload } from '../queues/job-payload.interface';
import { OpenAiService } from '../common/openai/openai.service';

const SYSTEM_PROMPT = `Categorize the Indian bank transaction. Return JSON only: {"category": "<category>", "subcategory": "<subcategory>"}

Valid categories and example subcategories:
- Food & Dining: Restaurant, Fast Food, Groceries, Cafe, Food Delivery
- Shopping: Clothing, Electronics, Online Shopping, Department Store, General
- Transportation: Fuel, Cab/Auto, Metro/Bus, Parking, Toll
- Entertainment: Movies, Streaming, Gaming, Events
- Health: Pharmacy, Hospital, Fitness, Insurance
- Travel: Hotel, Flight, Bus, Train
- Bills & Utilities: Electricity, Internet, Mobile Recharge, Rent, EMI
- Education: Tuition, Books, Online Course
- Other: Miscellaneous`;

@Processor(QUEUES.CATEGORIZATION)
export class CategorizationWorker extends WorkerHost {
  private readonly logger = new Logger(CategorizationWorker.name);

  constructor(
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
    @InjectQueue(QUEUES.FRAUD) private readonly fraudQueue: Queue,
    private readonly openAi: OpenAiService,
  ) {
    super();
  }

  async process(job: Job<JobPayload>): Promise<void> {
    const { userId, messageId, extractionResult } = job.data;
    if (!extractionResult) return;

    let category = 'Other';
    let subcategory = 'Miscellaneous';
    let totalTokens = 0;

    try {
      const { content, inputTokens, outputTokens } = await this.openAi.chat(
        'gpt-4o-mini',
        [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Merchant: ${extractionResult.merchant}\nAmount: ₹${extractionResult.amount}`,
          },
        ],
        { temperature: 0, max_tokens: 80 },
      );
      totalTokens = inputTokens + outputTokens;

      const parsed = JSON.parse(content) as Partial<CategorizationResult>;
      category = parsed.category ?? 'Other';
      subcategory = parsed.subcategory ?? 'Miscellaneous';
    } catch (err) {
      this.logger.error(`Categorization error for ${messageId}: ${(err as Error).message}`);
    }

    // Find the most-recently created extracted transaction for this user + merchant + amount
    const transaction = await this.transactionModel.findOne(
      { userId, merchant: extractionResult.merchant, amount: extractionResult.amount, status: 'extracted' },
      {},
      { sort: { createdAt: -1 } },
    );

    if (transaction) {
      await this.transactionModel.findByIdAndUpdate(transaction._id, {
        category,
        subcategory,
        status: 'categorized',
        $inc: { openaiTokensUsed: totalTokens },
      });
    }

    const categorizationResult: CategorizationResult = { category, subcategory };

    await this.fraudQueue.add(
      'fraud-check',
      { ...job.data, categorizationResult } satisfies JobPayload,
      { ...QUEUE_DEFAULT_JOB_OPTIONS, jobId: `fraud-${messageId}` },
    );

    this.logger.debug(`[${messageId}] categorized → ${category} / ${subcategory}`);
  }
}
