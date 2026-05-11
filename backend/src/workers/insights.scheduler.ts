import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../database/schemas/user.schema';
import { QUEUES, QUEUE_DEFAULT_JOB_OPTIONS } from '../queues/queue.constants';

@Injectable()
export class InsightsScheduler {
  private readonly logger = new Logger(InsightsScheduler.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectQueue(QUEUES.INSIGHTS) private readonly insightsQueue: Queue,
  ) {}

  /** Runs every night at 02:00 UTC. Dispatches one insights job per active user. */
  @Cron('0 2 * * *')
  async dispatchNightly(): Promise<void> {
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const users = await this.userModel.find({ 'imapAccounts.0': { $exists: true }, isActive: true });

    for (const user of users) {
      await this.insightsQueue.add(
        'generate',
        { userId: user._id.toString(), period },
        {
          ...QUEUE_DEFAULT_JOB_OPTIONS,
          jobId: `insights-${user._id.toString()}-${period}`, // deduplication
        },
      );
    }

    this.logger.log(`Dispatched nightly insights jobs for ${users.length} users (period: ${period})`);
  }
}
