import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type ReprocessPhase = 'idle' | 'queuing' | 'pipeline-running' | 'done' | 'error';

const LS_PIPELINE_KEY = 'fc_pipeline_started_at';
const POLL_INTERVAL_MS = 10_000;        // 10 s between polls
const MAX_POLL_DURATION_MS = 600_000;   // stop auto-polling after 10 min

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule],
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
            <input formControlName="email" type="email" readonly
              class="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none opacity-60 cursor-not-allowed"
              style="background-color: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text)">
          </div>
          <button type="submit" [disabled]="profileLoading() || profileForm.invalid || profileForm.pristine"
            class="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            style="background-color: var(--color-primary); color: #fff">
            {{ profileLoading() ? 'Saving…' : 'Save changes' }}
          </button>
        </form>
      </div>

      <!-- ── Reset & Re-process ──────────────────────────────────────────── -->
      <div class="rounded-xl border p-6 space-y-4"
        style="background-color: var(--color-surface); border-color: var(--color-border)">
        <div>
          <h2 class="text-sm font-semibold" style="color: var(--color-text)">Reset &amp; Re-process Emails</h2>
          <p class="text-sm mt-1 leading-relaxed" style="color: var(--color-muted)">
            Deletes all previously extracted transactions and cards, then re-runs the AI pipeline
            on every stored email from scratch. Use this after first setup or if merchant names
            look wrong.
          </p>
          @if (lastReprocessAt()) {
            <p class="text-xs mt-2" style="color: var(--color-muted)">
              Last reset triggered: <span class="font-medium" style="color: var(--color-text)">{{ formatDateTime(lastReprocessAt()) }}</span>
            </p>
          }
        </div>

        <!-- Pipeline-running progress card -->
        @if (reprocessPhase() === 'pipeline-running') {
          <div class="rounded-lg p-4 space-y-3"
            style="background-color: rgba(99,102,241,0.07); border: 1px solid rgba(99,102,241,0.35)">
            <div class="flex items-center gap-2">
              <span class="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
                style="border-color: var(--color-primary); border-top-color: transparent"></span>
              <span class="text-sm font-semibold" style="color: var(--color-primary)">AI pipeline running…</span>
            </div>

            @if (pipelineProgress(); as prog) {
              @if (prog.total > 0) {
                <div>
                  <div class="flex justify-between text-xs mb-1.5" style="color: var(--color-muted)">
                    <span>Emails analysed</span>
                    <span class="font-medium" style="color: var(--color-text)">{{ prog.done }} / {{ prog.total }}</span>
                  </div>
                  <div class="w-full rounded-full h-2" style="background-color: var(--color-border)">
                    <div class="h-2 rounded-full transition-all duration-500"
                      style="background-color: var(--color-primary)"
                      [style.width.%]="prog.total > 0 ? (prog.done / prog.total) * 100 : 0">
                    </div>
                  </div>
                  @if (prog.pending > 0) {
                    <p class="text-xs mt-1.5" style="color: var(--color-muted)">
                      {{ prog.pending }} email(s) still in queue — page auto-refreshes every 10 s
                    </p>
                  }
                </div>
              }
            } @else {
              <p class="text-xs" style="color: var(--color-muted)">Checking progress…</p>
            }
          </div>
        }

        <!-- Success banner -->
        @if (reprocessPhase() === 'done' && reprocessResult()) {
          <div class="rounded-lg px-4 py-3 text-sm"
            style="background-color: rgba(34,197,94,0.1); color: var(--color-success); border: 1px solid var(--color-success)">
            ✅ {{ reprocessResult() }}
          </div>
        }

        <!-- Error banner -->
        @if (reprocessPhase() === 'error' && reprocessError()) {
          <div class="rounded-lg px-4 py-3 text-sm"
            style="background-color: rgba(239,68,68,0.1); color: var(--color-danger); border: 1px solid var(--color-danger)">
            {{ reprocessError() }}
          </div>
        }

        <!-- Trigger button — disabled while queuing or pipeline is running -->
        <button (click)="reprocess()" [disabled]="reprocessPhase() === 'queuing' || reprocessPhase() === 'pipeline-running'"
          class="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2 border"
          style="border-color: var(--color-danger); color: var(--color-danger)">
          @if (reprocessPhase() === 'queuing') {
            <span class="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin"
              style="border-color: var(--color-danger); border-top-color: transparent"></span>
            Queuing emails…
          } @else if (reprocessPhase() === 'pipeline-running') {
            <span class="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin"
              style="border-color: var(--color-danger); border-top-color: transparent"></span>
            Processing…
          } @else {
            🔄 Reset &amp; Re-process All Emails
          }
        </button>
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
              } @else { 🔄 }
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

      <!-- ── Danger Zone ─────────────────────────────────────────────────── -->
      <div class="rounded-xl border p-6 space-y-4"
        style="background-color: var(--color-surface); border-color: rgba(239,68,68,0.3)">
        <div>
          <h2 class="text-sm font-semibold" style="color: var(--color-danger)">Danger Zone</h2>
          <p class="text-sm mt-1 leading-relaxed" style="color: var(--color-muted)">
            Permanently deletes your account and every piece of data associated with it —
            transactions, cards, emails, notifications and insights. This cannot be undone.
          </p>
        </div>

        <!-- Step 1: Show the delete button -->
        @if (!showDeleteConfirm()) {
          <button (click)="showDeleteConfirm.set(true)"
            class="rounded-lg px-5 py-2.5 text-sm font-semibold border"
            style="border-color: var(--color-danger); color: var(--color-danger)">
            🗑 Delete My Account
          </button>
        }

        <!-- Step 2: Inline confirmation card -->
        @if (showDeleteConfirm()) {
          <div class="rounded-lg border p-5 space-y-4"
            style="background-color: rgba(239,68,68,0.05); border-color: var(--color-danger)">

            <div class="flex items-start gap-3">
              <span class="text-2xl flex-shrink-0">⚠️</span>
              <div class="space-y-1">
                <p class="text-sm font-semibold" style="color: var(--color-danger)">
                  This is irreversible.
                </p>
                <p class="text-sm leading-relaxed" style="color: var(--color-muted)">
                  Your account, all transactions, cards, synced emails, notifications and AI
                  insights will be permanently erased. There is no way to recover this data.
                </p>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium mb-1.5" style="color: var(--color-muted)">
                Type <strong style="color: var(--color-danger)">DELETE</strong> to confirm
              </label>
              <input [(ngModel)]="deleteConfirmText" type="text" autocomplete="off"
                class="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none font-mono"
                style="background-color: var(--color-bg); border: 1px solid var(--color-danger); color: var(--color-text)"
                placeholder="DELETE">
            </div>

            @if (deleteError()) {
              <div class="rounded-lg px-4 py-2.5 text-sm"
                style="background-color: rgba(239,68,68,0.1); color: var(--color-danger); border: 1px solid var(--color-danger)">
                {{ deleteError() }}
              </div>
            }

            <div class="flex gap-2">
              <button (click)="deleteAccount()"
                [disabled]="deleteConfirmText !== 'DELETE' || deleting()"
                class="flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40"
                style="background-color: var(--color-danger); color: #fff">
                {{ deleting() ? 'Deleting…' : 'Permanently Delete My Account' }}
              </button>
              <button type="button" (click)="cancelDelete()"
                class="rounded-lg px-4 py-2.5 text-sm border"
                style="border-color: var(--color-border); color: var(--color-muted)">
                Cancel
              </button>
            </div>
          </div>
        }
      </div>

    </div>
  `,
})
export class SettingsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly authStore = inject(AuthStore);
  private readonly fb = inject(FormBuilder);

  readonly providers = PROVIDERS;
  readonly formatDateTime = formatDateTime;
  readonly timeAgo = timeAgo;

  // ── Reprocess ────────────────────────────────────────────────────────────
  readonly reprocessPhase = signal<ReprocessPhase>('idle');
  readonly reprocessResult = signal<string | null>(null);
  readonly reprocessError = signal<string | null>(null);
  readonly lastReprocessAt = signal<string | null>(null);
  readonly pipelineProgress = signal<{ total: number; done: number; pending: number } | null>(null);

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // ── Profile ───────────────────────────────────────────────────────────────
  readonly profileLoading = signal(false);
  readonly profileSaved = signal(false);
  readonly profileForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: [{ value: '', disabled: true }],
  });

  // ── Accounts ──────────────────────────────────────────────────────────────
  readonly accounts = signal<ImapAccount[]>([]);
  readonly accountsLoading = signal(true);
  readonly accountError = signal<string | null>(null);
  readonly syncMessage = signal<string | null>(null);
  readonly syncing = signal(false);

  // ── Add-account form ──────────────────────────────────────────────────────
  readonly showAddForm = signal(false);
  readonly addProvider = signal<'yahoo' | 'gmail' | 'outlook'>('yahoo');
  readonly addAccountLoading = signal(false);
  readonly addAccountForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    appPassword: ['', Validators.required],
  });
  readonly currentAddProvider = computed(() => PROVIDERS.find((p) => p.id === this.addProvider()));

  // ── Delete account ────────────────────────────────────────────────────────
  readonly showDeleteConfirm = signal(false);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);
  deleteConfirmText = '';

  ngOnInit() {
    const user = this.authStore.user();
    if (user) {
      this.profileForm.patchValue({ name: user.name, email: user.email });
      this.lastReprocessAt.set(user.lastReprocessAt ?? null);
    }
    // Load fresh user data to pick up lastReprocessAt
    this.api.getMe().subscribe({
      next: (u) => {
        this.lastReprocessAt.set(u.lastReprocessAt ?? null);
        this.authStore.setUser(u);
      },
    });
    this.loadAccounts();

    // Resume pipeline-running state if a reprocess was triggered before the
    // page was reloaded and the 10-minute window hasn't elapsed yet.
    try {
      const stored = localStorage.getItem(LS_PIPELINE_KEY);
      if (stored) {
        const startedAt = new Date(stored).getTime();
        if (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
          this.reprocessPhase.set('pipeline-running');
          this.startPipelinePolling();
        } else {
          localStorage.removeItem(LS_PIPELINE_KEY);
        }
      }
    } catch { /* localStorage unavailable (SSR / private mode) */ }
  }

  ngOnDestroy() {
    this.stopPipelinePolling();
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

  // ── Reprocess ─────────────────────────────────────────────────────────────

  reprocess() {
    this.reprocessPhase.set('queuing');
    this.reprocessResult.set(null);
    this.reprocessError.set(null);
    this.pipelineProgress.set(null);

    this.api.reprocessEmails().subscribe({
      next: (res) => {
        const { txDeleted, cardDeleted, emailsQueued } = res.stats;
        this.lastReprocessAt.set(res.lastReprocessAt);

        if (emailsQueued === 0) {
          // Nothing to process — done immediately
          this.reprocessResult.set(
            `Cleared ${txDeleted} transaction(s) and ${cardDeleted} card(s). ` +
            `No stored emails were found to re-process.`,
          );
          this.reprocessPhase.set('done');
          return;
        }

        // Seed the progress counter from what the API told us
        this.pipelineProgress.set({ total: emailsQueued, done: 0, pending: emailsQueued });

        // Persist start time so we can resume after a page reload
        try { localStorage.setItem(LS_PIPELINE_KEY, res.lastReprocessAt); } catch { /* ok */ }

        this.reprocessPhase.set('pipeline-running');
        this.startPipelinePolling();
      },
      error: (err: { error?: { message?: string } }) => {
        this.reprocessError.set(err?.error?.message ?? 'Reprocess failed. Please try again.');
        this.reprocessPhase.set('error');
      },
    });
  }

  private startPipelinePolling() {
    this.stopPipelinePolling();
    // Poll once immediately, then on every interval tick
    this.checkPipelineProgress();
    this.pollTimer = setInterval(() => this.checkPipelineProgress(), POLL_INTERVAL_MS);
  }

  private stopPipelinePolling() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private checkPipelineProgress() {
    this.api.getPipelineStatus().subscribe({
      next: (status) => {
        this.pipelineProgress.set(status);

        if (status.total > 0 && status.pending === 0) {
          // All emails have been processed by the AI pipeline
          this.stopPipelinePolling();
          try { localStorage.removeItem(LS_PIPELINE_KEY); } catch { /* ok */ }
          this.reprocessPhase.set('done');
          this.reprocessResult.set(
            `All ${status.total} email(s) analysed. ` +
            `New transactions will appear in the Transactions tab.`,
          );
        }
      },
      error: () => { /* silently ignore transient poll failures */ },
    });
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  loadAccounts() {
    this.accountsLoading.set(true);
    this.api.getImapAccounts().subscribe({
      next: (res) => { this.accounts.set(res.accounts); this.accountsLoading.set(false); },
      error: () => this.accountsLoading.set(false),
    });
  }

  triggerSync() {
    this.syncing.set(true);
    this.syncMessage.set(null);
    this.api.syncImap().subscribe({
      next: () => {
        this.syncMessage.set('Sync started. Transactions will update shortly.');
        this.syncing.set(false);
        setTimeout(() => this.loadAccounts(), 3000);
      },
      error: () => {
        this.accountError.set('Could not start sync. Please try again.');
        this.syncing.set(false);
      },
    });
  }

  disconnectAccount(email: string) {
    if (!confirm(`Remove ${email}?\nThis will not delete your transaction history.`)) return;
    this.api.disconnectImapAccount(email).subscribe({
      next: () => this.accounts.update((list) => list.filter((a) => a.email !== email)),
      error: () => this.accountError.set('Could not remove account. Try again.'),
    });
  }

  addAccount() {
    if (this.addAccountForm.invalid) return;
    this.addAccountLoading.set(true);
    this.accountError.set(null);
    const { email, appPassword } = this.addAccountForm.getRawValue();
    this.api.connectImap({ email, appPassword, provider: this.addProvider() }).subscribe({
      next: () => {
        this.addAccountLoading.set(false);
        this.cancelAdd();
        this.loadAccounts();
      },
      error: (err: { error?: { message?: string } }) => {
        this.accountError.set(err?.error?.message ?? 'Could not connect. Check email and App Password.');
        this.addAccountLoading.set(false);
      },
    });
  }

  cancelAdd() {
    this.showAddForm.set(false);
    this.addAccountForm.reset();
  }

  // ── Delete account ────────────────────────────────────────────────────────

  deleteAccount() {
    if (this.deleteConfirmText !== 'DELETE') return;
    this.deleting.set(true);
    this.deleteError.set(null);
    this.api.deleteAccount().subscribe({
      next: () => {
        // Clear local auth state and redirect to login
        this.authStore.setUser(null as never);
        this.router.navigate(['/login']);
      },
      error: (err: { error?: { message?: string } }) => {
        this.deleteError.set(err?.error?.message ?? 'Could not delete account. Please try again.');
        this.deleting.set(false);
      },
    });
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
    this.deleteConfirmText = '';
    this.deleteError.set(null);
  }
}
