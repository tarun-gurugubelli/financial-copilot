import { Component } from '@angular/core';

@Component({
  selector: 'app-notifications',
  standalone: true,
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-xl font-semibold" style="color: var(--color-text)">Notifications</h1>
        <p class="text-sm mt-0.5" style="color: var(--color-muted)">Alerts for new transactions and fraud flags</p>
      </div>

      <div class="flex flex-col items-center justify-center py-24 gap-4 rounded-xl border"
        style="background-color: var(--color-surface); border-color: var(--color-border)">
        <span class="text-5xl">🔔</span>
        <p class="font-medium" style="color: var(--color-text)">All caught up!</p>
        <p class="text-sm" style="color: var(--color-muted)">
          Real-time notifications via WebSocket will appear here (Phase 3).
        </p>
      </div>
    </div>
  `,
})
export class NotificationsComponent {}
