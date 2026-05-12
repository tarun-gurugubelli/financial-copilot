import { Component, inject, signal, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';

type Step = 'welcome' | 'credentials' | 'syncing';

interface Provider {
  id: 'yahoo' | 'gmail' | 'outlook';
  label: string;
  icon: string;
  placeholder: string;
  helpUrl: string;
  helpLabel: string;
  note: string;
}

const PROVIDERS: Provider[] = [
  {
    id: 'yahoo',
    label: 'Yahoo Mail',
    icon: '📨',
    placeholder: 'yourname@yahoo.com',
    helpUrl: 'https://login.yahoo.com/account/security',
    helpLabel: 'Generate Yahoo App Password',
    note: 'Requires 2-step verification enabled on your Yahoo account.',
  },
  {
    id: 'gmail',
    label: 'Gmail',
    icon: '✉️',
    placeholder: 'yourname@gmail.com',
    helpUrl: 'https://myaccount.google.com/apppasswords',
    helpLabel: 'Generate Gmail App Password',
    note: 'Requires 2-step verification enabled and IMAP enabled in Gmail settings.',
  },
  {
    id: 'outlook',
    label: 'Outlook',
    icon: '📧',
    placeholder: 'yourname@outlook.com',
    helpUrl: 'https://account.microsoft.com/security',
    helpLabel: 'Set up Outlook App Password',
    note: 'Requires 2-step verification enabled on your Microsoft account.',
  },
];

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center px-4" style="background-color: var(--color-bg)">
      <div class="w-full max-w-lg">

        <!-- Step indicators -->
        <div class="flex items-center justify-center gap-2 mb-8">
          @for (s of steps; track s; let i = $index) {
            <div class="h-1.5 w-10 rounded-full transition-colors"
              [style.background-color]="currentStepIndex() >= i ? 'var(--color-primary)' : 'var(--color-border)'">
            </div>
          }
        </div>

        <div class="rounded-xl border p-8" style="background-color: var(--color-surface); border-color: var(--color-border)">

          <!-- Step 1: Welcome -->
          @if (step() === 'welcome') {
            <div class="text-center space-y-4">
              <div class="text-4xl">📬</div>
              <h2 class="text-xl font-semibold" style="color: var(--color-text)">Welcome to Financial Copilot</h2>
              <p class="text-sm leading-relaxed" style="color: var(--color-muted)">
                Connect your email account and we'll automatically detect Indian bank transaction
                emails — HDFC, Axis, ICICI, IDFC, Yes Bank and more. Only transaction data is
                extracted; raw emails stay private.
              </p>
              <button (click)="step.set('credentials')"
                class="w-full rounded-lg py-2.5 text-sm font-semibold mt-4"
                style="background-color: var(--color-primary); color: #fff">
                Get Started
              </button>
            </div>
          }

          <!-- Step 2: Provider + credentials -->
          @if (step() === 'credentials') {
            <div class="space-y-5">
              <div>
                <h2 class="text-lg font-semibold" style="color: var(--color-text)">Connect your email</h2>
                <p class="text-sm mt-1" style="color: var(--color-muted)">
                  Choose your email provider and enter an App Password.
                </p>
              </div>

              @if (error()) {
                <div class="rounded-lg px-4 py-3 text-sm"
                  style="background-color: rgba(239,68,68,0.1); color: var(--color-danger); border: 1px solid var(--color-danger)">
                  {{ error() }}
                </div>
              }

              <!-- Provider selector -->
              <div class="grid grid-cols-3 gap-2">
                @for (p of providers; track p.id) {
                  <button type="button" (click)="selectedProvider.set(p.id)"
                    class="rounded-lg py-3 px-2 text-xs font-medium flex flex-col items-center gap-1 transition-all border"
                    [style.border-color]="selectedProvider() === p.id ? 'var(--color-primary)' : 'var(--color-border)'"
                    [style.background-color]="selectedProvider() === p.id ? 'rgba(99,102,241,0.1)' : 'var(--color-bg)'"
                    [style.color]="selectedProvider() === p.id ? 'var(--color-primary)' : 'var(--color-muted)'">
                    <span class="text-xl">{{ p.icon }}</span>
                    {{ p.label }}
                  </button>
                }
              </div>

              <!-- Provider-specific help -->
              @if (currentProvider()) {
                <div class="rounded-lg px-4 py-3 text-xs leading-relaxed"
                  style="background-color: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-muted)">
                  {{ currentProvider()!.note }}
                  <a [href]="currentProvider()!.helpUrl" target="_blank" rel="noopener"
                    class="block mt-1 underline" style="color: var(--color-primary)">
                    {{ currentProvider()!.helpLabel }} →
                  </a>
                </div>
              }

              <form [formGroup]="form" (ngSubmit)="connect()" class="space-y-4">
                <div>
                  <label class="block text-sm font-medium mb-1.5" style="color: var(--color-muted)">Email address</label>
                  <input formControlName="email" type="email"
                    class="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                    style="background-color: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text)"
                    [placeholder]="currentProvider()?.placeholder ?? 'yourname@example.com'">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1.5" style="color: var(--color-muted)">App Password</label>
                  <input formControlName="appPassword" type="password"
                    class="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none font-mono tracking-widest"
                    style="background-color: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text)"
                    placeholder="xxxx xxxx xxxx xxxx">
                </div>
                <button type="submit" [disabled]="loading() || form.invalid"
                  class="w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
                  style="background-color: var(--color-primary); color: #fff">
                  {{ loading() ? 'Testing connection…' : 'Test & Connect' }}
                </button>
              </form>
            </div>
          }

          <!-- Step 3: Syncing -->
          @if (step() === 'syncing') {
            <div class="text-center space-y-4">
              <div class="flex justify-center">
                <div class="h-10 w-10 rounded-full border-2 border-t-transparent animate-spin"
                  style="border-color: var(--color-primary); border-top-color: transparent"></div>
              </div>
              <h2 class="text-xl font-semibold" style="color: var(--color-text)">Scanning your inbox…</h2>
              <p class="text-sm" style="color: var(--color-muted)">
                We're fetching your last 90 days of bank transaction emails.
                This may take a minute — you can go to the dashboard now.
              </p>
              <button (click)="goToDashboard()"
                class="text-sm underline"
                style="color: var(--color-muted)">
                Go to dashboard
              </button>
            </div>
          }

        </div>
      </div>
    </div>
  `,
})
export class OnboardingComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly providers = PROVIDERS;
  readonly steps = ['welcome', 'credentials', 'syncing'];
  readonly step = signal<Step>('welcome');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedProvider = signal<'yahoo' | 'gmail' | 'outlook'>('yahoo');

  readonly currentStepIndex = () => this.steps.indexOf(this.step());
  readonly currentProvider = computed(() =>
    PROVIDERS.find((p) => p.id === this.selectedProvider()),
  );

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    appPassword: ['', Validators.required],
  });

  async connect() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const { email, appPassword } = this.form.getRawValue();
    const provider = this.selectedProvider();
    try {
      await this.api.connectImap({ email, appPassword, provider }).toPromise();
      this.step.set('syncing');
      setTimeout(() => this.goToDashboard(), 5000);
    } catch (err: unknown) {
      const msg =
        (err as { error?: { message?: string } })?.error?.message ??
        `Could not connect to ${this.currentProvider()?.label ?? 'your email'}. Check the email and App Password.`;
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }
}
