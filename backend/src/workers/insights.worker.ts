import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model, Types } from 'mongoose';
import { Transaction, TransactionDocument } from '../database/schemas/transaction.schema';
import { AiInsight, AiInsightDocument } from '../database/schemas/ai-insight.schema';
import { QUEUES } from '../queues/queue.constants';
import { OpenAiService } from '../common/openai/openai.service';

interface InsightsJobPayload {
  userId: string;
  period: string; // "YYYY-MM"
}

const SYSTEM_PROMPT = `You are a personal finance advisor reviewing an Indian user's monthly card spending.
Analyse the data and return JSON only:
{
  "summary": "<2-3 sentences describing the overall spending pattern>",
  "highlights": ["<key insight 1>", "<key insight 2>", "<key insight 3>"],
  "alerts": [
    {
      "type": "high_spend",
      "category": "<category or null>",
      "threshold": <expected monthly amount>,
      "actual": <actual amount>,
      "message": "<one-line actionable advice>",
      "severity": "info | warning | critical"
    }
  ]
}
Only include alerts when there is something genuinely noteworthy. Keep insights concise and actionable.`;

@Processor(QUEUES.INSIGHTS)
export class InsightsWorker extends WorkerHost {
  private readonly logger = new Logger(InsightsWorker.name);

  constructor(
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(AiInsight.name) private readonly aiInsightModel: Model<AiInsightDocument>,
    private readonly openAi: OpenAiService,
  ) {
    super();
  }

  async process(job: Job<InsightsJobPayload>): Promise<void> {
    const { userId, period } = job.data;

    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const transactions = await this.transactionModel
      .find({ userId: new Types.ObjectId(userId), timestamp: { $gte: start, $lt: end } })
      .lean();

    if (transactions.length === 0) {
      this.logger.debug(`No transactions for user ${userId} in ${period} — skipping insights`);
      return;
    }

    const totalSpend = transactions.reduce((s, t) => s + t.amount, 0);

    // Category aggregation
    const categoryMap = new Map<string, number>();
    for (const t of transactions) {
      categoryMap.set(t.category, (categoryMap.get(t.category) ?? 0) + t.amount);
    }
    const topCategories = [...categoryMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount: Math.round(amount) }));

    const spendBreakdown = topCategories
      .map(({ category, amount }) => `  ${category}: ₹${amount.toLocaleString('en-IN')}`)
      .join('\n');

    const topMerchants = [...new Set(transactions.map((t) => t.merchant))].slice(0, 5).join(', ');

    const userPrompt = `Period: ${period}
Total transactions: ${transactions.length}
Total spend: ₹${Math.round(totalSpend).toLocaleString('en-IN')}

Spending by category:
${spendBreakdown}

Top merchants: ${topMerchants}`;

    // Defaults — used if GPT call fails
    let summary = `You made ${transactions.length} transactions totalling ₹${Math.round(totalSpend).toLocaleString('en-IN')} in ${period}.`;
    let highlights: string[] = [];
    let alerts: AiInsight['alerts'] = [];
    let openaiTokensUsed = 0;

    try {
      const { content, inputTokens, outputTokens } = await this.openAi.chat(
        'gpt-4o',
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.3, max_tokens: 600 },
      );
      openaiTokensUsed = inputTokens + outputTokens;

      const parsed = JSON.parse(content) as {
        summary?: string;
        highlights?: string[];
        alerts?: AiInsight['alerts'];
      };
      summary = parsed.summary ?? summary;
      highlights = Array.isArray(parsed.highlights) ? parsed.highlights : [];
      alerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];
    } catch (err) {
      this.logger.error(
        `Insights generation error for ${userId}/${period}: ${(err as Error).message}`,
      );
    }

    // Idempotent upsert — safe to run twice for the same period
    await this.aiInsightModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), period },
      {
        userId: new Types.ObjectId(userId),
        period,
        summary,
        highlights,
        alerts,
        totalSpend: Math.round(totalSpend),
        topCategories,
        generatedAt: new Date(),
        openaiTokensUsed,
      },
      { upsert: true, new: true },
    );

    this.logger.log(
      `Insights generated for user ${userId} | ${period} | ₹${Math.round(totalSpend).toLocaleString('en-IN')} | ${openaiTokensUsed} tokens`,
    );
  }
}
