import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly config: ConfigService) {}

  // Ping own health endpoint every 9 minutes to prevent Render free-tier spin-down
  @Cron('0 */9 * * * *')
  async keepAlive(): Promise<void> {
    const base =
      this.config.get<string>('RENDER_EXTERNAL_URL') ??
      `http://localhost:${this.config.get<number>('PORT') ?? 3000}`;

    try {
      const res = await fetch(`${base}/api/health`);
      this.logger.log(`keep-alive ping → ${res.status}`);
    } catch (err) {
      this.logger.warn(`keep-alive ping failed: ${(err as Error).message}`);
    }
  }
}
