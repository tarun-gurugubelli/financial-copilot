import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';

import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { RedisModule } from './common/redis/redis.module';
import { QueuesModule } from './queues/queues.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CardsModule } from './modules/cards/cards.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ImapModule } from './modules/imap/imap.module';
import { ImapSyncScheduler } from './modules/imap/imap-sync.scheduler';
import { EmailProcessorWorker } from './workers/email-processor.worker';
import { Transaction, TransactionSchema } from './database/schemas/transaction.schema';
import { EmailRaw, EmailRawSchema } from './database/schemas/email-raw.schema';
import { Card, CardSchema } from './database/schemas/card.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
    DatabaseModule,
    CryptoModule,
    RedisModule,
    QueuesModule,
    AuthModule,
    UsersModule,
    CardsModule,
    TransactionsModule,
    ImapModule,
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: EmailRaw.name, schema: EmailRawSchema },
      { name: Card.name, schema: CardSchema },
    ]),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    ImapSyncScheduler,
    EmailProcessorWorker,
  ],
})
export class AppModule {}
