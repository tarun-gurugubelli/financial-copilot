import { Types } from 'mongoose';

export interface ExtractionResult {
  amount: number;
  currency: string;
  merchant: string;
  bankName?: string;
  transactionType?: 'UPI' | 'POS' | 'Online' | 'ATM' | null;
  card_last4: string | null;
  timestamp: Date;
  location?: string;
  isEmi: boolean;
  emiDetails?: { totalAmount: number; tenure: number; monthlyAmount: number };
  confidence: number;
}

export interface CategorizationResult {
  category: string;
  subcategory: string;
}

export interface FraudResult {
  fraudScore: number;
  fraudFlags: string[];
  fraudReasoning?: string;
}

export interface JobPayload {
  jobId: string;
  userId: string;
  emailRawId?: string;
  messageId: string;
  emailType?: 'transaction' | 'otp' | 'statement' | 'reward' | 'spam';
  extractionResult?: ExtractionResult;
  categorizationResult?: CategorizationResult;
  fraudResult?: FraudResult;
  /** Set by the reprocess endpoint so every job in the chain gets a unique ID,
   *  bypassing BullMQ's duplicate-suppression for previously-completed jobs. */
  runId?: number;
}
