import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';

import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { RedisModule } from './common/redis/redis.module';
import { OpenAiModule } from './common/openai/openai.module';
import { QueuesModule } from './queues/queues.module';
import { LoggerModule } from './common/logger/logger.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { GatewayModule } from './common/gateway/gateway.module';
import { AuditMiddleware } from './common/middleware/audit.middleware';

// Domain modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CardsModule } from './modules/cards/cards.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ImapModule } from './modules/imap/imap.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { InsightsModule } from './modules/insights/insights.module';

// Schedulers
import { ImapSyncScheduler } from './modules/imap/imap-sync.scheduler';
import { InsightsScheduler } from './workers/insights.scheduler';

// Phase 2 pipeline workers
import { ClassificationWorker } from './workers/classification.worker';
import { ExtractionWorker } from './workers/extraction.worker';
import { CategorizationWorker } from './workers/categorization.worker';
import { FraudWorker } from './workers/fraud.worker';
import { NotificationWorker } from './workers/notification.worker';
import { InsightsWorker } from './workers/insights.worker';

// Schemas needed by workers registered in AppModule
import { Transaction, TransactionSchema } from './database/schemas/transaction.schema';
import { EmailRaw, EmailRawSchema } from './database/schemas/email-raw.schema';
import { Card, CardSchema } from './database/schemas/card.schema';
import { Notification, NotificationSchema } from './database/schemas/notification.schema';
import { AiInsight, AiInsightSchema } from './database/schemas/ai-insight.schema';
import { User, UserSchema } from './database/schemas/user.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),

    // Observability
    LoggerModule,
    MetricsModule,

    // Infrastructure
    DatabaseModule,
    CryptoModule,
    RedisModule,
    OpenAiModule,
    QueuesModule,

    // WebSocket gateway (must be before domain modules that emit events)
    GatewayModule,

    // Domain modules (own REST controllers + model registration)
    AuthModule,
    UsersModule,
    CardsModule,
    TransactionsModule,
    ImapModule,
    NotificationsModule,
    InsightsModule,

    // Models required by pipeline workers (registered here because workers live in AppModule)
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: EmailRaw.name, schema: EmailRawSchema },
      { name: Card.name, schema: CardSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: AiInsight.name, schema: AiInsightSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // Schedulers
    ImapSyncScheduler,
    InsightsScheduler,

    // Phase 2 AI pipeline workers
    ClassificationWorker,
    ExtractionWorker,
    CategorizationWorker,
    FraudWorker,
    NotificationWorker,
    InsightsWorker,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuditMiddleware).forRoutes('*');
  }
}
