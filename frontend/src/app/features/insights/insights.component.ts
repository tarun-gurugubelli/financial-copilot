import { Component } from '@angular/core';

@Component({
  selector: 'app-insights',
  standalone: true,
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-xl font-semibold" style="color: var(--color-text)">AI Insights</h1>
        <p class="text-sm mt-0.5" style="color: var(--color-muted)">Personalised spending analysis powered by GPT-4o</p>
      </div>

      <div class="flex flex-col items-center justify-center py-24 gap-4 rounded-xl border"
        style="background-color: var(--color-surface); border-color: var(--color-border)">
        <span class="text-5xl">🤖</span>
        <p class="font-medium" style="color: var(--color-text)">AI Insights — Coming in Phase 3</p>
        <p class="text-sm text-center max-w-sm" style="color: var(--color-muted)">
          Once your transactions are synced, GPT-4o will analyse your spending patterns
          and surface personalised recommendations here.
        </p>
      </div>
    </div>
  `,
})
export class InsightsComponent {}
