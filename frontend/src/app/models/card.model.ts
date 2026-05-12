export interface Card {
  _id: string;
  userId: string;
  last4: string;
  bankName: string;
  network: string;
  nickname?: string;
  creditLimit: number;
  currentBalance: number;
  billingCycleDay?: number;
  dueDate?: string;
  isActive: boolean;
  createdAt: string;
}
