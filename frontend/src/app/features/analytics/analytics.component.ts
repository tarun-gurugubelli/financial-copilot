import { Component } from '@angular/core';

@Component({
  selector: 'app-analytics',
  standalone: true,
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-xl font-semibold" style="color: var(--color-text)">Analytics</h1>
        <p class="text-sm mt-0.5" style="color: var(--color-muted)">Visual spending trends and breakdowns</p>
      </div>

      <div class="flex flex-col items-center justify-center py-24 gap-4 rounded-xl border"
        style="background-color: var(--color-surface); border-color: var(--color-border)">
        <span class="text-5xl">📈</span>
        <p class="font-medium" style="color: var(--color-text)">Analytics — Coming in Phase 3</p>
        <p class="text-sm text-center max-w-sm" style="color: var(--color-muted)">
          Charts and trend analysis will appear here once you have transactions synced.
        </p>
      </div>
    </div>
  `,
})
export class AnalyticsComponent {}
