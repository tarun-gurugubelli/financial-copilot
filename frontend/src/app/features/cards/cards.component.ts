import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { Card } from '../../models/card.model';

@Component({
  selector: 'app-cards',
  standalone: true,
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-xl font-semibold" style="color: var(--color-text)">Cards</h1>
        <p class="text-sm mt-0.5" style="color: var(--color-muted)">Credit cards detected from your emails</p>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <div class="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
            style="border-color: var(--color-primary); border-top-color: transparent"></div>
        </div>
      } @else if (cards().length === 0) {
        <div class="flex flex-col items-center py-20 gap-3 rounded-xl border"
          style="background-color: var(--color-surface); border-color: var(--color-border)">
          <span class="text-5xl">🪪</span>
          <p class="text-sm" style="color: var(--color-muted)">No cards detected yet. Sync your emails first.</p>
        </div>
      } @else {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          @for (card of cards(); track card._id) {
            <div class="rounded-xl border p-5 space-y-3"
              style="background-color: var(--color-surface); border-color: var(--color-border)">
              <div class="flex items-start justify-between">
                <div>
                  <p class="font-semibold text-sm" style="color: var(--color-text)">{{ card.bankName }}</p>
                  <p class="text-xs mt-0.5" style="color: var(--color-muted)">•••• •••• •••• {{ card.last4 }}</p>
                </div>
                <span class="text-2xl">💳</span>
              </div>
              <div class="border-t pt-3" style="border-color: var(--color-border)">
                <p class="text-xs" style="color: var(--color-muted)">Total Spent</p>
                <p class="text-lg font-bold mt-0.5" style="color: var(--color-danger)">
                  ₹{{ card.currentBalance.toLocaleString() }}
                </p>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class CardsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly cards = signal<Card[]>([]);
  readonly loading = signal(true);

  ngOnInit() {
    this.api.getCards().subscribe({
      next: cards => { this.cards.set(cards); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
