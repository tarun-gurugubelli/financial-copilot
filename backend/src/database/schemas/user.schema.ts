import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

/** Stored credentials for one connected email inbox */
export interface ImapAccount {
  email: string;
  provider: 'yahoo' | 'gmail' | 'outlook';
  host: string;
  /** AES-GCM encrypted app-password fields */
  iv: string;
  authTag: string;
  ciphertext: string;
  lastSyncAt: Date | null;
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  /**
   * One entry per connected email account.
   * Replaces the old scalar `imapCredentials` field.
   */
  @Prop({
    type: [
      {
        _id: false,
        email: { type: String, required: true },
        provider: { type: String, enum: ['yahoo', 'gmail', 'outlook'], required: true },
        host: { type: String, required: true },
        iv: { type: String, required: true },
        authTag: { type: String, required: true },
        ciphertext: { type: String, required: true },
        lastSyncAt: { type: Date, default: null },
      },
    ],
    default: [],
  })
  imapAccounts: ImapAccount[];

  @Prop({ type: Date, default: null })
  lastSyncAt: Date | null;

  @Prop({ type: Date, default: null })
  lastReprocessAt: Date | null;

  @Prop({ enum: ['idle', 'syncing', 'error'], default: 'idle' })
  syncStatus: 'idle' | 'syncing' | 'error';

  @Prop({ default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
