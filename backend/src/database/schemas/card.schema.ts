import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CardDocument = Card & Document;

@Schema({ timestamps: true })
export class Card {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, length: 4 })
  last4: string;

  @Prop({ required: true, trim: true })
  bankName: string;

  @Prop({ enum: ['Visa', 'Mastercard', 'Amex', 'RuPay', 'Other'], default: 'Other' })
  network: string;

  @Prop({ trim: true })
  nickname: string;

  @Prop({ required: true, min: 0 })
  creditLimit: number;

  @Prop({ default: 0 })
  currentBalance: number;

  @Prop({ min: 1, max: 31 })
  billingCycleDay: number;

  @Prop({ default: null })
  dueDate: Date | null;

  @Prop({ default: true })
  isActive: boolean;
}

export const CardSchema = SchemaFactory.createForClass(Card);
CardSchema.index({ userId: 1 });
CardSchema.index({ userId: 1, last4: 1 });
