import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import type { AuthResponse, User, ImapAccount } from '../models/user.model';
import type { TransactionPage } from '../models/transaction.model';
import type { Card } from '../models/card.model';
import type { Notification, NotificationsResponse } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  // ── Auth ──────────────────────────────────────────────────────────────────

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

  // ── User ──────────────────────────────────────────────────────────────────

  getMe() {
    return this.http.get<User>(`${this.base}/users/me`, { withCredentials: true });
  }
  updateMe(body: Partial<Pick<User, 'name'>>) {
    return this.http.put<User>(`${this.base}/users/me`, body, { withCredentials: true });
  }

  // ── IMAP accounts ─────────────────────────────────────────────────────────

  /** Add or update a connected email account */
  connectImap(body: { email: string; appPassword: string; provider: string }) {
    return this.http.post<{ message: string; syncStatus: string; provider: string }>(
      `${this.base}/imap/connect`, body, { withCredentials: true },
    );
  }

  /** Get all connected accounts (no credentials) */
  getImapAccounts() {
    return this.http.get<{ accounts: ImapAccount[]; syncStatus: string; lastSyncAt: string | null }>(
      `${this.base}/imap/accounts`, { withCredentials: true },
    );
  }

  /** Remove a connected email account */
  disconnectImapAccount(email: string) {
    return this.http.delete<{ message: string }>(
      `${this.base}/imap/accounts/${encodeURIComponent(email)}`, { withCredentials: true },
    );
  }

  /** Trigger a manual sync for all connected accounts */
  syncImap() {
    return this.http.post<{ message: string; syncStatus: string }>(
      `${this.base}/imap/sync`, {}, { withCredentials: true },
    );
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  getTransactions(params: { page?: number; limit?: number; category?: string; search?: string } = {}) {
    return this.http.get<TransactionPage>(`${this.base}/transactions`, {
      params: params as Record<string, string | number>,
      withCredentials: true,
    });
  }

  // ── Cards ─────────────────────────────────────────────────────────────────

  getCards() {
    return this.http.get<Card[]>(`${this.base}/cards`, { withCredentials: true });
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  getNotifications(params: { limit?: number; unreadOnly?: boolean } = {}) {
    return this.http.get<NotificationsResponse>(`${this.base}/notifications`, {
      params: params as Record<string, string | number | boolean>,
      withCredentials: true,
    });
  }

  markNotificationRead(id: string) {
    return this.http.patch<{ ok: boolean }>(
      `${this.base}/notifications/${id}/read`, {}, { withCredentials: true },
    );
  }

  markAllNotificationsRead() {
    return this.http.patch<{ ok: boolean; updated: number }>(
      `${this.base}/notifications/read-all`, {}, { withCredentials: true },
    );
  }

  // ── Insights ─────────────────────────────────────────────────────────────

  getInsights() {
    return this.http.get<{ insights: unknown[] }>(`${this.base}/insights`, { withCredentials: true });
  }

  getInsightByPeriod(period: string) {
    return this.http.get<{ insight: unknown }>(`${this.base}/insights/${period}`, { withCredentials: true });
  }
}
