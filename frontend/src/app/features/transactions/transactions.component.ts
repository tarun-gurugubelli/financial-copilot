import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Transaction } from '../../models/transaction.model';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="space-y-5">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-xl font-semibold" style="color: var(--color-text)">Transactions</h1>
          <p class="text-sm mt-0.5" style="color: var(--color-muted)">All detected credit card transactions</p>
        </div>

        <!-- Search -->
        <input [(ngModel)]="search" (ngModelChange)="onSearch()" type="search"
          placeholder="Search merchant…"
          class="rounded-lg px-3.5 py-2 text-sm outline-none w-56"
          style="background-color: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text)">
      </div>

      <!-- API error -->
      @if (apiError()) {
        <div class="rounded-lg px-4 py-3 text-sm"
          style="background-color: rgba(239,68,68,0.1); color: var(--color-danger); border: 1px solid var(--color-danger)">
          <strong>Could not load transactions:</strong> {{ apiError() }}
          <button (click)="load()" class="ml-3 underline text-xs">Retry</button>
        </div>
      }

      <!-- Table -->
      <div class="rounded-xl border overflow-hidden" style="background-color: var(--color-surface); border-color: var(--color-border)">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b" style="border-color: var(--color-border)">
              @for (col of columns; track col) {
                <th class="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide"
                  style="color: var(--color-muted)">{{ col }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr>
                <td [attr.colspan]="columns.length" class="text-center py-12" style="color: var(--color-muted)">
                  Loading…
                </td>
              </tr>
            } @else if (transactions().length === 0) {
              <tr>
                <td [attr.colspan]="columns.length">
                  <div class="flex flex-col items-center py-16 gap-3">
                    <span class="text-4xl">📭</span>
                    <p class="font-medium" style="color: var(--color-text)">No transactions yet</p>
                    <p class="text-sm text-center max-w-sm" style="color: var(--color-muted)">
                      Transactions appear here after the AI pipeline processes your bank emails.
                      Go to <strong>Settings → Reset &amp; Re-process</strong> to kick off extraction,
                      or wait for the next automatic sync.
                    </p>
                  </div>
                </td>
              </tr>
            } @else {
              @for (tx of transactions(); track tx._id) {
                <tr class="border-b transition-colors hover:opacity-80" style="border-color: var(--color-border)">
                  <td class="px-4 py-3" style="color: var(--color-text)">{{ tx.timestamp | date:'MMM d, yyyy' }}</td>
                  <td class="px-4 py-3 font-medium" style="color: var(--color-text)">{{ tx.merchant }}</td>
                  <td class="px-4 py-3">
                    <span class="rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style="background-color: rgba(99,102,241,0.12); color: var(--color-primary)">
                      {{ tx.category }}
                    </span>
                  </td>
                  <td class="px-4 py-3" style="color: var(--color-muted)">{{ cardLabel(tx) }}</td>
                  <td class="px-4 py-3 font-semibold text-right" style="color: var(--color-danger)">₹{{ tx.amount.toLocaleString() }}</td>
                </tr>
              }
            }
          </tbody>
        </table>

        <!-- Pagination -->
        @if (total() > pageSize) {
          <div class="flex items-center justify-between px-4 py-3 border-t" style="border-color: var(--color-border)">
            <span class="text-xs" style="color: var(--color-muted)">{{ total() }} total</span>
            <div class="flex gap-2">
              <button (click)="prevPage()" [disabled]="page() === 1"
                class="px-3 py-1.5 rounded-lg text-xs disabled:opacity-40"
                style="background-color: var(--color-bg); color: var(--color-muted)">Previous</button>
              <button (click)="nextPage()" [disabled]="page() * pageSize >= total()"
                class="px-3 py-1.5 rounded-lg text-xs disabled:opacity-40"
                style="background-color: var(--color-bg); color: var(--color-muted)">Next</button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class TransactionsComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly columns = ['Date', 'Merchant', 'Category', 'Card', 'Amount'];
  readonly transactions = signal<Transaction[]>([]);
  readonly loading = signal(true);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly apiError = signal<string | null>(null);
  readonly pageSize = 20;
  search = '';

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.apiError.set(null);
    this.api.getTransactions({
      page: this.page(),
      limit: this.pageSize,
      ...(this.search ? { search: this.search } : {}),
    }).subscribe({
      next: res => {
        this.transactions.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: (err: { status?: number; message?: string; error?: { message?: string } }) => {
        const msg = err?.error?.message ?? err?.message ?? `HTTP ${err?.status ?? 'error'}`;
        this.apiError.set(msg);
        this.loading.set(false);
      },
    });
  }

  cardLabel(tx: Transaction): string {
    if (!tx.cardId) return '—';
    if (typeof tx.cardId === 'object') return `${tx.cardId.bankName} ••${tx.cardId.last4}`;
    return '—';
  }

  onSearch() { this.page.set(1); this.load(); }
  nextPage() { this.page.update(p => p + 1); this.load(); }
  prevPage() { this.page.update(p => p - 1); this.load(); }
}
