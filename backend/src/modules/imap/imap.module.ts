import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { ImapService } from './imap.service';
import { ImapController } from './imap.controller';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { EmailRaw, EmailRawSchema } from '../../database/schemas/email-raw.schema';
import { Transaction, TransactionSchema } from '../../database/schemas/transaction.schema';
import { Card, CardSchema } from '../../database/schemas/card.schema';
import { QUEUES } from '../../queues/queue.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: EmailRaw.name, schema: EmailRawSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Card.name, schema: CardSchema },
    ]),
    BullModule.registerQueue({ name: QUEUES.CLASSIFICATION }),
  ],
  providers: [ImapService],
  controllers: [ImapController],
  exports: [ImapService],
})
export class ImapModule {}
