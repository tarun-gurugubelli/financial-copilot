import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

const SIX_MONTHS_SECONDS = 60 * 60 * 24 * 30 * 6;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    enum: [
      'transaction_new',
      'fraud_alert',
      'extraction_failed',
      'insight_generated',
      'utilization_warning',
      'due_date_reminder',
      'sync_error',
    ],
    required: true,
  })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ enum: ['info', 'warning', 'critical'], default: 'info' })
  severity: string;

  @Prop({ type: Types.ObjectId, default: null })
  relatedId: Types.ObjectId | null;

  @Prop()
  relatedCollection: string;

  @Prop({ default: null })
  readAt: Date | null;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, readAt: 1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: SIX_MONTHS_SECONDS },
);
