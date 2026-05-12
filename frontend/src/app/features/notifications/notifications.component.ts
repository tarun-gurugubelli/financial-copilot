import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../services/api.service';
import type { Notification, NotificationType } from '../../models/notification.model';

const TYPE_META: Record<NotificationType, { icon: string; label: string }> = {
  transaction_new: { icon: '💳', label: 'Transaction' },
  fraud_alert: { icon: '🚨', label: 'Fraud Alert' },
  extraction_failed: { icon: '⚠️', label: 'Processing Issue' },
  insight_generated: { icon: '💡', label: 'New Insight' },
  utilization_warning: { icon: '📊', label: 'Utilization Warning' },
  due_date_reminder: { icon: '📅', label: 'Payment Due' },
  sync_error: { icon: '🔄', label: 'Sync Error' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold" style="color: var(--color-text)">Notifications</h1>
          <p class="text-sm mt-0.5" style="color: var(--color-muted)">
            Transaction alerts and account updates
          </p>
        </div>
        <div class="flex items-center gap-3">
          @if (unreadCount() > 0) {
            <span class="text-xs font-semibold px-2 py-1 rounded-full"
              style="background-color: var(--color-primary); color: #fff">
              {{ unreadCount() }} unread
            </span>
            <button (click)="markAllRead()"
              class="text-xs underline"
              style="color: var(--color-muted)">
              Mark all read
            </button>
          }
        </div>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="flex justify-center py-20">
          <div class="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
            style="border-color: var(--color-primary); border-top-color: transparent"></div>
        </div>
      }

      <!-- Empty state -->
      @if (!loading() && notifications().length === 0) {
        <div class="flex flex-col items-center justify-center py-24 gap-4 rounded-xl border"
          style="background-color: var(--color-surface); border-color: var(--color-border)">
          <span class="text-5xl">🔔</span>
          <p class="font-medium" style="color: var(--color-text)">All caught up!</p>
          <p class="text-sm" style="color: var(--color-muted)">
            Notifications will appear here as your transactions are processed.
          </p>
        </div>
      }

      <!-- Notification list -->
      @if (!loading() && notifications().length > 0) {
        <div class="rounded-xl border overflow-hidden"
          style="background-color: var(--color-surface); border-color: var(--color-border)">
          @for (n of notifications(); track n._id; let last = $last) {
            <div
              (click)="markRead(n)"
              class="flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors hover:brightness-110"
              [style.border-bottom]="last ? 'none' : '1px solid var(--color-border)'"
              [style.background-color]="n.readAt ? 'transparent' : 'rgba(99,102,241,0.05)'">

              <!-- Icon -->
              <div class="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-lg"
                [style.background-color]="severityBg(n.severity)">
                {{ typeIcon(n.type) }}
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-semibold truncate"
                    [style.color]="n.readAt ? 'var(--color-muted)' : 'var(--color-text)'">
                    {{ n.title }}
                  </p>
                  @if (!n.readAt) {
                    <span class="h-2 w-2 rounded-full flex-shrink-0"
                      style="background-color: var(--color-primary)"></span>
                  }
                </div>
                <p class="text-xs mt-0.5 truncate" style="color: var(--color-muted)">
                  {{ n.body }}
                </p>
              </div>

              <!-- Time -->
              <span class="flex-shrink-0 text-xs" style="color: var(--color-muted)">
                {{ timeAgo(n.createdAt) }}
              </span>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class NotificationsComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly loading = signal(true);
  readonly notifications = signal<Notification[]>([]);
  readonly unreadCount = signal(0);

  readonly timeAgo = timeAgo;

  typeIcon(type: NotificationType): string {
    return TYPE_META[type]?.icon ?? '🔔';
  }

  severityBg(severity: string): string {
    if (severity === 'critical') return 'rgba(239,68,68,0.1)';
    if (severity === 'warning') return 'rgba(245,158,11,0.1)';
    return 'rgba(99,102,241,0.1)';
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.getNotifications({ limit: 100 }).subscribe({
      next: (res) => {
        this.notifications.set(res.notifications);
        this.unreadCount.set(res.unreadCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  markRead(n: Notification) {
    if (n.readAt) return;
    this.api.markNotificationRead(n._id).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((x) => x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x),
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
      },
    });
  }

  markAllRead() {
    this.api.markAllNotificationsRead().subscribe({
      next: () => {
        const now = new Date().toISOString();
        this.notifications.update((list) =>
          list.map((x) => ({ ...x, readAt: x.readAt ?? now })),
        );
        this.unreadCount.set(0);
      },
    });
  }
}
