import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionDocument = Transaction & Document;

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Card', required: true })
  cardId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ default: 'INR' })
  currency: string;

  @Prop({ required: true, trim: true })
  merchant: string;

  @Prop({ default: 'Other' })
  category: string;

  @Prop({ default: '' })
  subcategory: string;

  @Prop({
    enum: ['pending', 'extracted', 'categorized', 'needs_review', 'failed'],
    default: 'pending',
  })
  status: string;

  @Prop({ enum: ['imap', 'manual', 'csv'], default: 'imap' })
  source: string;

  @Prop({ required: true })
  timestamp: Date;

  @Prop({ trim: true })
  location: string;

  @Prop({ default: false })
  isEmi: boolean;

  @Prop({
    type: { totalAmount: Number, tenure: Number, monthlyAmount: Number },
    default: null,
  })
  emiDetails: { totalAmount: number; tenure: number; monthlyAmount: number } | null;

  @Prop({ default: 0, min: 0, max: 1 })
  extractionConfidence: number;

  @Prop({ default: 0, min: 0, max: 1 })
  fraudScore: number;

  @Prop({ type: [String], default: [] })
  fraudFlags: string[];

  @Prop()
  fraudReasoning: string;

  @Prop({ type: Types.ObjectId, ref: 'EmailRaw' })
  emailRawId: Types.ObjectId;

  @Prop({ default: 0 })
  openaiTokensUsed: number;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ userId: 1, timestamp: -1 });
TransactionSchema.index({ userId: 1, cardId: 1 });
TransactionSchema.index({ userId: 1, category: 1 });
TransactionSchema.index({ userId: 1, status: 1 });
