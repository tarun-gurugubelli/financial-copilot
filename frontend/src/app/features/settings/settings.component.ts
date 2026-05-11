import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthStore } from '../../state/auth.store';
import type { ImapAccount } from '../../models/user.model';

interface Provider {
  id: 'yahoo' | 'gmail' | 'outlook';
  label: string;
  icon: string;
  placeholder: string;
}

const PROVIDERS: Provider[] = [
  { id: 'yahoo', label: 'Yahoo Mail', icon: '📨', placeholder: 'yourname@yahoo.com' },
  { id: 'gmail', label: 'Gmail', icon: '✉️', placeholder: 'yourname@gmail.com' },
  { id: 'outlook', label: 'Outlook', icon: '📧', placeholder: 'yourname@outlook.com' },
];

const PROVIDER_HELP: Record<string, string> = {
  yahoo: 'https://login.yahoo.com/account/security',
  gmail: 'https://myaccount.google.com/apppasswords',
  outlook: 'https://account.microsoft.com/security',
};

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="space-y-6 max-w-xl">
      <div>
        <h1 class="text-xl font-semibold" style="color: var(--color-text)">Settings</h1>
        <p class="text-sm mt-0.5" style="color: var(--color-muted)">Manage your profile and connected accounts</p>
      </div>

      <!-- ── Profile ─────────────────────────────────────────────────────── -->
      <div class="rounded-xl border p-6 space-y-5"
        style="background-color: var(--color-surface); border-color: var(--color-border)">
        <h2 class="text-sm font-semibold" style="color: var(--color-text)">Profile</h2>

        @if (profileSaved()) {
          <div class="rounded-lg px-4 py-2.5 text-sm"
            style="background-color: rgba(34,197,94,0.1); color: var(--color-success); border: 1px solid var(--color-success)">
            Profile updated successfully.
          </div>
        }

        <form [formGroup]="profileForm" (ngSubmit)="saveProfile()" class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1.5" style="color: var(--color-muted)">Full Name</label>
            <input formControlName="name" type="text"
              class="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
              style="background-color: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text)">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1.5" style="color: var(--color-muted)">Email</label>
            <input formControlName="email" type="email"
              class="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none opacity-60 cursor-not-allowed"
              style="background-color: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text)"
              readonly>
          </div>
          <button type="submit" [disabled]="profileLoading() || profileForm.invalid || profileForm.pristine"
            class="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            style="background-color: var(--color-primary); color: #fff">
            {{ profileLoading() ? 'Saving…' : 'Save changes' }}
          </button>
        </form>
      </div>

      <!-- ── Connected Email Accounts ────────────────────────────────────── -->
      <div class="rounded-xl border p-6 space-y-5"
        style="background-color: var(--color-surface); border-color: var(--color-border)">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold" style="color: var(--color-text)">Connected Email Accounts</h2>
          <div class="flex items-center gap-2">
            <button (click)="triggerSync()" [disabled]="syncing()"
              class="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 border"
              style="border-color: var(--color-border); color: var(--color-muted)">
              @if (syncing()) {
                <span class="h-3 w-3 rounded-full border border-t-transparent animate-spin"
                  style="border-color: var(--color-primary); border-top-color: transparent"></span>
              } @else {
                🔄
              }
              {{ syncing() ? 'Syncing…' : 'Sync Now' }}
            </button>
          </div>
        </div>

        @if (syncMessage()) {
          <div class="rounded-lg px-4 py-2.5 text-sm"
            style="background-color: rgba(34,197,94,0.1); color: var(--color-success); border: 1px solid var(--color-success)">
            {{ syncMessage() }}
          </div>
        }

        @if (accountError()) {
          <div class="rounded-lg px-4 py-2.5 text-sm"
            style="background-color: rgba(239,68,68,0.1); color: var(--color-danger); border: 1px solid var(--color-danger)">
            {{ accountError() }}
          </div>
        }

        <!-- Account list -->
        @if (accounts().length > 0) {
          <div class="space-y-2">
            @for (acc of accounts(); track acc.email) {
              <div class="flex items-center justify-between rounded-lg px-4 py-3"
                style="background-color: var(--color-bg); border: 1px solid var(--color-border)">
                <div class="flex items-center gap-3">
                  <span class="text-xl">{{ providerIcon(acc.provider) }}</span>
                  <div>
                    <p class="text-sm font-medium" style="color: var(--color-text)">{{ acc.email }}</p>
                    <p class="text-xs" style="color: var(--color-muted)">
                      {{ providerLabel(acc.provider) }} · Last sync: {{ timeAgo(acc.lastSyncAt) }}
                    </p>
                  </div>
                </div>
                <button (click)="disconnectAccount(acc.email)"
                  class="text-xs px-2.5 py-1 rounded border transition-colors"
                  style="border-color: var(--color-danger); color: var(--color-danger)">
                  Remove
                </button>
              </div>
            }
          </div>
        }

        @if (accounts().length === 0 && !accountsLoading()) {
          <p class="text-sm py-2" style="color: var(--color-muted)">No email accounts connected yet.</p>
        }

        <!-- Add account form -->
        @if (!showAddForm()) {
          <button (click)="showAddForm.set(true)"
            class="w-full rounded-lg py-2.5 text-sm font-semibold border-2 border-dashed"
            style="border-color: var(--color-border); color: var(--color-muted)">
            + Add Email Account
          </button>
        } @else {
          <div class="rounded-xl border p-5 space-y-4"
            style="background-color: var(--color-bg); border-color: var(--color-border)">
            <p class="text-sm font-semibold" style="color: var(--color-text)">Add a new account</p>

            <!-- Provider selector -->
            <div class="grid grid-cols-3 gap-2">
              @for (p of providers; track p.id) {
                <button type="button" (click)="addProvider.set(p.id)"
                  class="rounded-lg py-2.5 px-2 text-xs font-medium flex flex-col items-center gap-1 border transition-all"
                  [style.border-color]="addProvider() === p.id ? 'var(--color-primary)' : 'var(--color-border)'"
                  [style.background-color]="addProvider() === p.id ? 'rgba(99,102,241,0.1)' : 'transparent'"
                  [style.color]="addProvider() === p.id ? 'var(--color-primary)' : 'var(--color-muted)'">
                  <span>{{ p.icon }}</span>{{ p.label }}
                </button>
              }
            </div>

            <form [formGroup]="addAccountForm" (ngSubmit)="addAccount()" class="space-y-3">
              <input formControlName="email" type="email"
                class="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                style="background-color: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text)"
                [placeholder]="currentAddProvider()?.placeholder ?? 'yourname@example.com'">
              <input formControlName="appPassword" type="password"
                class="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none font-mono tracking-widest"
                style="background-color: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text)"
                placeholder="App Password">

              <a [href]="providerHelpUrl(addProvider())" target="_blank" rel="noopener"
                class="block text-xs underline" style="color: var(--color-primary)">
                How to get an App Password for {{ currentAddProvider()?.label }} →
              </a>

              <div class="flex gap-2 pt-1">
                <button type="submit" [disabled]="addAccountLoading() || addAccountForm.invalid"
                  class="flex-1 rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
                  style="background-color: var(--color-primary); color: #fff">
                  {{ addAccountLoading() ? 'Connecting…' : 'Connect' }}
                </button>
                <button type="button" (click)="cancelAdd()"
                  class="rounded-lg px-4 py-2 text-sm border"
                  style="border-color: var(--color-border); color: var(--color-muted)">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        }
      </div>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly authStore = inject(AuthStore);
  private readonly fb = inject(FormBuilder);

  readonly providers = PROVIDERS;
  readonly timeAgo = timeAgo;

  // Profile
  readonly profileLoading = signal(false);
  readonly profileSaved = signal(false);
  readonly profileForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: [{ value: '', disabled: true }],
  });

  // Accounts
  readonly accounts = signal<ImapAccount[]>([]);
  readonly accountsLoading = signal(true);
  readonly accountError = signal<string | null>(null);
  readonly syncMessage = signal<string | null>(null);
  readonly syncing = signal(false);

  // Add-account form
  readonly showAddForm = signal(false);
  readonly addProvider = signal<'yahoo' | 'gmail' | 'outlook'>('yahoo');
  readonly addAccountLoading = signal(false);
  readonly addAccountForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    appPassword: ['', Validators.required],
  });

  readonly currentAddProvider = () => PROVIDERS.find((p) => p.id === this.addProvider());

  ngOnInit() {
    const user = this.authStore.user();
    if (user) {
      this.profileForm.patchValue({ name: user.name, email: user.email });
    }
    this.loadAccounts();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  providerIcon(provider: string): string {
    return PROVIDERS.find((p) => p.id === provider)?.icon ?? '📧';
  }
  providerLabel(provider: string): string {
    return PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
  }
  providerHelpUrl(provider: string): string {
    return PROVIDER_HELP[provider] ?? '#';
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  saveProfile() {
    if (this.profileForm.invalid) return;
    this.profileLoading.set(true);
    this.profileSaved.set(false);
    this.api.updateMe({ name: this.profileForm.getRawValue().name }).subscribe({
      next: (user) => {
        this.authStore.setUser(user);
        this.profileSaved.set(true);
        this.profileForm.markAsPristine();
        this.profileLoading.set(false);
      },
      error: () => this.profileLoading.set(false),
    });
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  loadAccounts() {
    this.accountsLoading.set(true);
    this.api.getImapAccounts().subscribe({
      next: (res) => {
        this.accounts.set(res.accounts);
        this.accountsLoading.set(false);
      },
      error: () => this.accountsLoading.set(false),
    });
  }

  triggerSync() {
    this.syncing.set(true);
    this.syncMessage.set(null);
    this.api.syncImap().subscribe({
      next: () => {
        this.syncMessage.set('Sync started. Your transactions will update shortly.');
        this.syncing.set(false);
        // Refresh account list after a short delay to pick up lastSyncAt changes
        setTimeout(() => this.loadAccounts(), 3000);
      },
      error: () => {
        this.accountError.set('Could not start sync. Please try again.');
        this.syncing.set(false);
      },
    });
  }

  disconnectAccount(email: string) {
    if (!confirm(`Remove ${email}? This will not delete your transaction history.`)) return;
    this.api.disconnectImapAccount(email).subscribe({
      next: () => {
        this.accounts.update((list) => list.filter((a) => a.email !== email));
      },
      error: () => this.accountError.set('Could not remove account. Try again.'),
    });
  }

  addAccount() {
    if (this.addAccountForm.invalid) return;
    this.addAccountLoading.set(true);
    this.accountError.set(null);
    const { email, appPassword } = this.addAccountForm.getRawValue();
    const provider = this.addProvider();
    this.api.connectImap({ email, appPassword, provider }).subscribe({
      next: () => {
        this.addAccountLoading.set(false);
        this.cancelAdd();
        this.loadAccounts();
      },
      error: (err: { error?: { message?: string } }) => {
        this.accountError.set(
          err?.error?.message ?? 'Could not connect. Check email and App Password.',
        );
        this.addAccountLoading.set(false);
      },
    });
  }

  cancelAdd() {
    this.showAddForm.set(false);
    this.addAccountForm.reset();
  }
}
