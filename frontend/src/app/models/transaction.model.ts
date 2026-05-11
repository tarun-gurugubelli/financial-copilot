export interface Transaction {
  _id: string;
  userId: string;
  cardId: string | { _id: string; last4: string; bankName: string; network: string; nickname?: string };
  amount: number;
  currency: string;
  merchant: string;
  category: string;
  subcategory: string;
  status: 'pending' | 'extracted' | 'categorized' | 'needs_review' | 'failed';
  source: string;
  timestamp: string;
  location?: string;
  isEmi: boolean;
  extractionConfidence: number;
  fraudScore: number;
  fraudFlags: string[];
  createdAt: string;
}

export interface TransactionPage {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
