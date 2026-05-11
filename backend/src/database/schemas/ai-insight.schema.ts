import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AiInsightDocument = AiInsight & Document;

@Schema({ timestamps: true })
export class AiInsight {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  period: string; // "2026-05"

  @Prop({ required: true })
  summary: string;

  @Prop({ type: [String], default: [] })
  highlights: string[];

  @Prop({
    type: [
      {
        type: String,
        category: String,
        threshold: Number,
        actual: Number,
        message: String,
        severity: String,
      },
    ],
    default: [],
  })
  alerts: {
    type: string;
    category?: string;
    threshold: number;
    actual: number;
    message: string;
    severity: string;
  }[];

  @Prop({ default: 0 })
  totalSpend: number;

  @Prop({
    type: [{ category: String, amount: Number }],
    default: [],
  })
  topCategories: { category: string; amount: number }[];

  @Prop({ default: null })
  generatedAt: Date;

  @Prop({ default: 0 })
  openaiTokensUsed: number;
}

export const AiInsightSchema = SchemaFactory.createForClass(AiInsight);
AiInsightSchema.index({ userId: 1, period: 1 }, { unique: true });
