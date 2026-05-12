import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ImapService } from './imap.service';

@Injectable()
export class ImapSyncScheduler {
  private readonly logger = new Logger(ImapSyncScheduler.name);

  constructor(
    private readonly imapService: ImapService,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/5 * * * *')
  async handleCron(): Promise<void> {
    this.logger.log('IMAP sync cron fired');
    try {
      await this.imapService.syncAllUsers();
    } catch (err) {
      this.logger.error(`IMAP sync cron error: ${(err as Error).message}`);
    }
  }
}
