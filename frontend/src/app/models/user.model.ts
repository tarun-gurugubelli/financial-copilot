export interface User {
  id: string;
  name: string;
  email: string;
  hasImapCredentials: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
}

export interface AuthResponse {
  user: User;
}
