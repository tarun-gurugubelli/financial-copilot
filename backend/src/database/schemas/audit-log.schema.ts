import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

const NINETY_DAYS_SECONDS = 60 * 60 * 24 * 90;

@Schema()
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId: Types.ObjectId | null;

  @Prop({ required: true })
  action: string;

  @Prop()
  resource: string;

  @Prop({ type: Types.ObjectId, default: null })
  resourceId: Types.ObjectId | null;

  @Prop({ required: true })
  ip: string;

  @Prop()
  userAgent: string;

  @Prop({ enum: ['success', 'failure'], required: true })
  result: string;

  @Prop()
  errorMessage: string;

  @Prop({ default: () => new Date() })
  timestamp: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: NINETY_DAYS_SECONDS },
);
