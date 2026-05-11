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
  async handleCron() {
    this.logger.log('Dispatching IMAP sync jobs');
    await this.imapService.dispatchSyncJobs();
  }
}
