export interface ImapAccount {
  email: string;
  provider: 'yahoo' | 'gmail' | 'outlook';
  lastSyncAt: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  /** Number of connected email accounts */
  connectedAccounts: number;
  imapAccounts: ImapAccount[];
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncAt: string | null;
  lastReprocessAt: string | null;
}

export interface AuthResponse {
  user: User;
}
