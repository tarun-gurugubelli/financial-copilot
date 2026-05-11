import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersController } from './users.controller';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Transaction, TransactionSchema } from '../../database/schemas/transaction.schema';
import { Card, CardSchema } from '../../database/schemas/card.schema';
import { EmailRaw, EmailRawSchema } from '../../database/schemas/email-raw.schema';
import { Notification, NotificationSchema } from '../../database/schemas/notification.schema';
import { AiInsight, AiInsightSchema } from '../../database/schemas/ai-insight.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Card.name, schema: CardSchema },
      { name: EmailRaw.name, schema: EmailRawSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: AiInsight.name, schema: AiInsightSchema },
    ]),
  ],
  controllers: [UsersController],
})
export class UsersModule {}
