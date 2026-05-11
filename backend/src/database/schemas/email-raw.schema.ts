import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmailRawDocument = EmailRaw & Document;

@Schema({ timestamps: true })
export class EmailRaw {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  messageId: string;

  @Prop({ trim: true })
  subject: string;

  @Prop({ trim: true })
  from: string;

  @Prop({ required: true })
  receivedAt: Date;

  @Prop({ maxlength: 10240 })
  bodyText: string;

  @Prop({ maxlength: 51200 })
  bodyHtml: string;

  @Prop()
  bodyHash: string;

  @Prop({
    enum: ['transaction', 'otp', 'statement', 'reward', 'spam'],
    default: null,
  })
  emailType: string | null;

  @Prop({
    enum: ['pending', 'processed', 'low_confidence', 'failed'],
    default: 'pending',
  })
  status: string;

  @Prop({ default: false })
  processed: boolean;

  @Prop({ default: null })
  processedAt: Date | null;
}

export const EmailRawSchema = SchemaFactory.createForClass(EmailRaw);
EmailRawSchema.index({ userId: 1, messageId: 1 }, { unique: true });
EmailRawSchema.index({ userId: 1, status: 1 });
