import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User, UserSchema } from './schemas/user.schema';
import { Card, CardSchema } from './schemas/card.schema';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { EmailRaw, EmailRawSchema } from './schemas/email-raw.schema';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { AiInsight, AiInsightSchema } from './schemas/ai-insight.schema';

export const DATABASE_MODELS = MongooseModule.forFeature([
  { name: User.name, schema: UserSchema },
  { name: Card.name, schema: CardSchema },
  { name: Transaction.name, schema: TransactionSchema },
  { name: EmailRaw.name, schema: EmailRawSchema },
  { name: Notification.name, schema: NotificationSchema },
  { name: AuditLog.name, schema: AuditLogSchema },
  { name: AiInsight.name, schema: AiInsightSchema },
]);

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
      }),
    }),
    DATABASE_MODELS,
  ],
  exports: [DATABASE_MODELS],
})
export class DatabaseModule {}
