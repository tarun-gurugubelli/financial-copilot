import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({
    type: {
      email: String,
      iv: String,
      authTag: String,
      ciphertext: String,
    },
    default: null,
  })
  imapCredentials: {
    email: string;
    iv: string;
    authTag: string;
    ciphertext: string;
  } | null;

  @Prop({ default: null })
  lastSyncAt: Date | null;

  @Prop({ enum: ['idle', 'syncing', 'error'], default: 'idle' })
  syncStatus: 'idle' | 'syncing' | 'error';

  @Prop({ default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true });
