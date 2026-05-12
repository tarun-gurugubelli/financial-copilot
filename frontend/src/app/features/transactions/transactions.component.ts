import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Transaction } from '../../models/transaction.model';

type DatePreset = 'all' | '15d' | '1m' | '3m' | 'custom';

interface Preset { id: DatePreset; label: string; }
const PRESETS: Preset[] = [
  { id: 'all',    label: 'All time' },
  { id: '15d',    label: 'Last 15 days' },
  { id: '1m',     label: 'Last month' },
  { id: '3m',     label: 'Last 3 months' },
  { id: 'custom', label: 'Custom' },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function presetDates(id: DatePreset): { from: string; to: string } | null {
  const now = new Date();
  const to = isoDate(now);
  if (id === '15d') return { from: isoDate(new Date(now.getTime() - 15 * 86400000)), to };
  if (id === '1m')  return { from: isoDate(new Date(now.getTime() - 30 * 86400000)), to };
  if (id === '3m')  return { from: isoDate(new Date(now.getTime() - 90 * 86400000)), to };
  return null;
}

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="space-y-5">

      <!-- Header -->
      <div>
        <h1 class="text-xl font-semibold" style="color: var(--color-text)">Transactions</h1>
        <p class="text-sm mt-0.5" style="color: var(--color-muted)">All detected credit card transactions</p>
      </div>

      <!-- Filters row -->
      <div class="flex flex-wrap items-end gap-3">

        <!-- Date preset pills -->
        <div class="flex flex-wrap gap-1.5">
          @for (p of presets; track p.id) {
            <button (click)="selectPreset(p.id)"
              class="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
              [style.background-color]="activePreset() === p.id ? 'var(--color-primary)' : 'transparent'"
              [style.border-color]="activePreset() === p.id ? 'var(--color-primary)' : 'var(--color-border)'"
              [style.color]="activePreset() === p.id ? '#fff' : 'var(--color-muted)'">
              {{ p.label }}
            </button>
          }
        </div>

        <!-- Custom date inputs -->
        @if (activePreset() === 'custom') {
          <div class="flex items-center gap-2">
            <input type="date" [(ngModel)]="customFrom" (change)="onCustomChange()"
              class="rounded-lg px-3 py-1.5 text-sm outline-none"
              style="background-color: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text)">
            <span class="text-xs" style="color: var(--color-muted)">to</span>
            <input type="date" [(ngModel)]="customTo" (change)="onCustomChange()"
              class="rounded-lg px-3 py-1.5 text-sm outline-none"
              style="background-color: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text)">
          </div>
        }

        <!-- Search -->
        <input [(ngModel)]="search" (ngModelChange)="onSearch()" type="search"
          placeholder="Search merchant…"
          class="rounded-lg px-3.5 py-2 text-sm outline-none ml-auto"
          style="background-color: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text); min-width: 200px">
      </div>

      <!-- Sync for period banner -->
      @if (activePreset() !== 'all') {
        <div class="flex items-center justify-between rounded-lg px-4 py-2.5"
          style="background-color: rgba(99,102,241,0.07); border: 1px solid rgba(99,102,241,0.25)">
          <p class="text-xs" style="color: var(--color-muted)">
            Showing transactions in selected range. Missing emails?
          </p>
          <button (click)="syncPeriod()" [disabled]="syncing()"
            class="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
            style="background-color: var(--color-primary); color: #fff">
            @if (syncing()) {
              <span class="h-3 w-3 rounded-full border border-t-transparent animate-spin inline-block"
                style="border-color: #fff; border-top-color: transparent"></span>
              Syncing…
            } @else {
              🔄 Sync emails for this period
            }
          </button>
        </div>
      }

      @if (syncMessage()) {
        <div class="rounded-lg px-4 py-2.5 text-sm"
          style="background-color: rgba(34,197,94,0.1); color: var(--color-success); border: 1px solid var(--color-success)">
          {{ syncMessage() }}
        </div>
      }

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
                    <p class="font-medium" style="color: var(--color-text)">No transactions in this range</p>
                    <p class="text-sm text-center max-w-sm" style="color: var(--color-muted)">
                      @if (activePreset() !== 'all') {
                        Try "Sync emails for this period" above to fetch emails for the selected date range,
                        or choose a different filter.
                      } @else {
                        Transactions appear here after the AI pipeline processes your bank emails.
                        Go to <strong>Settings → Reset &amp; Re-process</strong> to kick off extraction.
                      }
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
            <span class="text-xs" style="color: var(--color-muted)">
              {{ total() }} transaction{{ total() === 1 ? '' : 's' }}
              @if (activePreset() !== 'all') { in selected range }
            </span>
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
  readonly presets = PRESETS;

  readonly transactions = signal<Transaction[]>([]);
  readonly loading = signal(true);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly apiError = signal<string | null>(null);
  readonly activePreset = signal<DatePreset>('all');
  readonly syncing = signal(false);
  readonly syncMessage = signal<string | null>(null);

  readonly pageSize = 20;
  search = '';
  customFrom = '';
  customTo = '';

  ngOnInit() { this.load(); }

  selectPreset(id: DatePreset) {
    this.activePreset.set(id);
    this.syncMessage.set(null);
    this.page.set(1);
    if (id !== 'custom') this.load();
  }

  onCustomChange() {
    if (this.customFrom && this.customTo) {
      this.page.set(1);
      this.load();
    }
  }

  onSearch() { this.page.set(1); this.load(); }
  nextPage() { this.page.update(p => p + 1); this.load(); }
  prevPage() { this.page.update(p => p - 1); this.load(); }

  load() {
    this.loading.set(true);
    this.apiError.set(null);

    const dates = this.activeDates();

    this.api.getTransactions({
      page: this.page(),
      limit: this.pageSize,
      ...(this.search              ? { search: this.search }    : {}),
      ...(dates?.from              ? { from: dates.from }        : {}),
      ...(dates?.to                ? { to:   dates.to }          : {}),
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

  syncPeriod() {
    const dates = this.activeDates();
    if (!dates) return;
    this.syncing.set(true);
    this.syncMessage.set(null);
    this.api.syncImap(dates.from).subscribe({
      next: () => {
        this.syncing.set(false);
        this.syncMessage.set('Sync started — new transactions will appear within a few minutes.');
      },
      error: () => {
        this.syncing.set(false);
        this.syncMessage.set('Could not start sync. Check Settings → Connected Accounts.');
      },
    });
  }

  cardLabel(tx: Transaction): string {
    if (!tx.cardId) return '—';
    if (typeof tx.cardId === 'object') return `${tx.cardId.bankName} ••${tx.cardId.last4}`;
    return '—';
  }

  private activeDates(): { from: string; to: string } | null {
    if (this.activePreset() === 'custom') {
      if (this.customFrom && this.customTo) return { from: this.customFrom, to: this.customTo };
      return null;
    }
    return presetDates(this.activePreset());
  }
}
