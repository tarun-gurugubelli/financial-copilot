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
  deleteAccount() {
    return this.http.delete<{ message: string }>(`${this.base}/users/me`, { withCredentials: true });
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

  /** Poll the AI pipeline progress for the current user */
  getPipelineStatus() {
    return this.http.get<{ total: number; done: number; pending: number }>(
      `${this.base}/imap/pipeline-status`, { withCredentials: true },
    );
  }

  /** Trigger a manual sync. Pass `from` (ISO date string) to fetch emails from a specific date. */
  syncImap(from?: string) {
    return this.http.post<{ message: string; syncStatus: string }>(
      `${this.base}/imap/sync`, from ? { from } : {}, { withCredentials: true },
    );
  }

  /** Delete all Phase-1 data and re-run the AI pipeline on every stored email */
  reprocessEmails() {
    return this.http.post<{
      message: string;
      lastReprocessAt: string;
      stats: { txDeleted: number; cardDeleted: number; emailsQueued: number };
    }>(`${this.base}/imap/reprocess`, {}, { withCredentials: true });
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  getTransactions(params: {
    page?: number; limit?: number; category?: string; search?: string;
    from?: string; to?: string;
  } = {}) {
    const p: Record<string, string | number> = {};
    if (params.page)     p['page']     = params.page;
    if (params.limit)    p['limit']    = params.limit;
    if (params.category) p['category'] = params.category;
    if (params.search)   p['search']   = params.search;
    if (params.from)     p['from']     = params.from;
    if (params.to)       p['to']       = params.to;
    return this.http.get<TransactionPage>(`${this.base}/transactions`, {
      params: p,
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
