import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import type { AuthResponse, User } from '../models/user.model';
import type { TransactionPage } from '../models/transaction.model';
import type { Card } from '../models/card.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  // Auth
  register(body: { name: string; email: string; password: string }) {
    return this.http.post<AuthResponse>(`${this.base}/auth/register`, body, { withCredentials: true });
  }
  login(body: { email: string; password: string }) {
    return this.http.post<AuthResponse>(`${this.base}/auth/login`, body, { withCredentials: true });
  }
  logout() {
    return this.http.post<void>(`${this.base}/auth/logout`, {}, { withCredentials: true });
  }
  refresh() {
    return this.http.post<AuthResponse>(`${this.base}/auth/refresh`, {}, { withCredentials: true });
  }

  // User
  getMe() {
    return this.http.get<User>(`${this.base}/users/me`, { withCredentials: true });
  }
  updateMe(body: Partial<Pick<User, 'name'>>) {
    return this.http.put<User>(`${this.base}/users/me`, body, { withCredentials: true });
  }

  // IMAP
  connectImap(body: { email: string; appPassword: string }) {
    return this.http.post<{ message: string; syncStatus: string }>(
      `${this.base}/imap/connect`, body, { withCredentials: true }
    );
  }

  // Transactions
  getTransactions(params: { page?: number; limit?: number; category?: string; search?: string } = {}) {
    return this.http.get<TransactionPage>(`${this.base}/transactions`, {
      params: params as Record<string, string | number>,
      withCredentials: true,
    });
  }

  // Cards
  getCards() {
    return this.http.get<Card[]>(`${this.base}/cards`, { withCredentials: true });
  }
}
