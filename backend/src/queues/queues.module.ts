import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUES } from './queue.constants';

const queues = Object.values(QUEUES).map((name) =>
  BullModule.registerQueue({ name }),
);

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const password = config.get<string>('REDIS_PASSWORD');
        return {
          connection: {
            host: config.get<string>('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT'),
            ...(password ? { password } : {}),
          },
        };
      },
    }),
    ...queues,
  ],
  exports: [...queues],
})
export class QueuesModule {}
