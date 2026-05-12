import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ChatResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

@Injectable()
export class OpenAiService implements OnModuleInit {
  private client!: OpenAI;
  private readonly logger = new Logger(OpenAiService.name);

  // Simple in-process circuit breaker
  private failures = 0;
  private readonly failureThreshold = 5;
  private circuitOpenedAt: number | null = null;
  private readonly halfOpenMs = 30_000;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not set — AI pipeline will be disabled');
      return;
    }
    this.client = new OpenAI({ apiKey });
    this.logger.log('OpenAI client initialised');
  }

  /**
   * Send a chat completion request with exponential-backoff retry (3 attempts)
   * and circuit breaker (opens after 5 consecutive failures, half-opens after 30 s).
   * Always requests JSON output via response_format.
   */
  async chat(
    model: 'gpt-4o' | 'gpt-4o-mini',
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    opts: { temperature?: number; max_tokens?: number } = {},
  ): Promise<ChatResult> {
    if (!this.client) {
      throw new Error('OpenAI client not initialised — OPENAI_API_KEY is missing');
    }
    this.assertCircuitClosed();

    let lastErr: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await this.client.chat.completions.create({
          model,
          messages,
          temperature: opts.temperature ?? 0.1,
          max_tokens: opts.max_tokens ?? 500,
          response_format: { type: 'json_object' },
        });

        this.failures = 0; // reset on success
        return {
          content: res.choices[0]?.message?.content ?? '{}',
          inputTokens: res.usage?.prompt_tokens ?? 0,
          outputTokens: res.usage?.completion_tokens ?? 0,
        };
      } catch (err) {
        lastErr = err as Error;
        const status = (err as { status?: number })?.status;

        // Do not retry non-429 4xx errors (bad request, auth, etc.)
        if (status && status >= 400 && status < 500 && status !== 429) break;

        if (attempt < 3) {
          // Exponential backoff with jitter: 1 s, ~2 s, ~4 s
          const delay = Math.min(1000 * 2 ** (attempt - 1) + Math.random() * 400, 10_000);
          this.logger.warn(
            `OpenAI attempt ${attempt} failed (HTTP ${status ?? 'network'}): retrying in ${Math.round(delay)}ms`,
          );
          await sleep(delay);
        }
      }
    }

    // Record failure for circuit breaker
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.circuitOpenedAt = Date.now();
      this.logger.error(
        `OpenAI circuit breaker OPEN after ${this.failures} consecutive failures`,
      );
    }

    throw lastErr!;
  }

  private assertCircuitClosed(): void {
    if (this.circuitOpenedAt === null) return;

    const elapsed = Date.now() - this.circuitOpenedAt;
    if (elapsed >= this.halfOpenMs) {
      this.logger.log('OpenAI circuit breaker HALF-OPEN — probing');
      this.circuitOpenedAt = null;
      this.failures = 0;
      return;
    }

    const waitSec = Math.ceil((this.halfOpenMs - elapsed) / 1000);
    throw new Error(`OpenAI circuit breaker OPEN — retry in ${waitSec}s`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
