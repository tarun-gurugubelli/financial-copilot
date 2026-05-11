import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { Transaction } from '../../models/transaction.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-xl font-semibold" style="color: var(--color-text)">Dashboard</h1>
        <p class="text-sm mt-0.5" style="color: var(--color-muted)">Overview of your finances</p>
      </div>

      <!-- Metric cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        @for (metric of metrics; track metric.label) {
          <div class="rounded-xl border p-5" style="background-color: var(--color-surface); border-color: var(--color-border)">
            <p class="text-xs font-medium uppercase tracking-wide" style="color: var(--color-muted)">{{ metric.label }}</p>
            <p class="text-2xl font-bold mt-1" style="color: var(--color-text)">{{ metric.value }}</p>
            <p class="text-xs mt-1" [style.color]="metric.trend >= 0 ? 'var(--color-success)' : 'var(--color-danger)'">
              {{ metric.trend >= 0 ? '▲' : '▼' }} {{ metric.trendLabel }}
            </p>
          </div>
        }
      </div>

      <!-- Recent transactions -->
      <div class="rounded-xl border" style="background-color: var(--color-surface); border-color: var(--color-border)">
        <div class="px-5 py-4 border-b" style="border-color: var(--color-border)">
          <h2 class="text-sm font-semibold" style="color: var(--color-text)">Recent Transactions</h2>
        </div>
        @if (recentTransactions().length === 0) {
          <div class="flex flex-col items-center justify-center py-16 gap-3">
            <span class="text-4xl">📭</span>
            <p class="text-sm" style="color: var(--color-muted)">No transactions yet. Connect your email to get started.</p>
          </div>
        } @else {
          <ul class="divide-y" style="border-color: var(--color-border)">
            @for (tx of recentTransactions(); track tx._id) {
              <li class="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p class="text-sm font-medium" style="color: var(--color-text)">{{ tx.merchant }}</p>
                  <p class="text-xs" style="color: var(--color-muted)">{{ tx.category }} · {{ tx.timestamp | date:'MMM d' }}</p>
                </div>
                <span class="text-sm font-semibold" style="color: var(--color-danger)">-₹{{ tx.amount.toLocaleString() }}</span>
              </li>
            }
          </ul>
        }
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly recentTransactions = signal<Transaction[]>([]);

  readonly metrics = [
    { label: 'Total Spent (Month)',  value: '—', trend: 0,  trendLabel: 'vs last month' },
    { label: 'Transactions',         value: '—', trend: 0,  trendLabel: 'this month' },
    { label: 'Top Category',         value: '—', trend: 0,  trendLabel: '' },
    { label: 'Cards Connected',      value: '—', trend: 0,  trendLabel: '' },
  ];

  ngOnInit() {
    this.api.getTransactions({ page: 1, limit: 5 }).subscribe({
      next: res => this.recentTransactions.set(res.data),
      error: () => {},
    });
  }
}
