import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';

type Step = 'welcome' | 'credentials' | 'syncing';

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
                We'll connect to your Yahoo Mail and automatically detect credit card transaction emails.
                No emails are stored — only the extracted transaction data.
              </p>
              <button (click)="step.set('credentials')"
                class="w-full rounded-lg py-2.5 text-sm font-semibold mt-4"
                style="background-color: var(--color-primary); color: #fff">
                Get Started
              </button>
            </div>
          }

          <!-- Step 2: Yahoo credentials -->
          @if (step() === 'credentials') {
            <div class="space-y-5">
              <div>
                <h2 class="text-lg font-semibold" style="color: var(--color-text)">Connect Yahoo Mail</h2>
                <p class="text-sm mt-1" style="color: var(--color-muted)">
                  You need a Yahoo App Password.
                  <a href="https://login.yahoo.com/account/security" target="_blank" rel="noopener"
                    class="underline" style="color: var(--color-primary)">Generate one here</a>
                  (requires 2FA enabled on Yahoo).
                </p>
              </div>

              @if (error()) {
                <div class="rounded-lg px-4 py-3 text-sm" style="background-color: rgba(239,68,68,0.1); color: var(--color-danger); border: 1px solid var(--color-danger)">
                  {{ error() }}
                </div>
              }

              <form [formGroup]="form" (ngSubmit)="connect()" class="space-y-4">
                <div>
                  <label class="block text-sm font-medium mb-1.5" style="color: var(--color-muted)">Yahoo Email</label>
                  <input formControlName="email" type="email"
                    class="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                    style="background-color: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text)"
                    placeholder="yourname@yahoo.com">
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
              <h2 class="text-xl font-semibold" style="color: var(--color-text)">Syncing your emails…</h2>
              <p class="text-sm" style="color: var(--color-muted)">
                This may take a minute. We'll redirect you when the first transaction is ready.
              </p>
              <button (click)="goToDashboard()"
                class="text-sm underline"
                style="color: var(--color-muted)">
                Skip and go to dashboard
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

  readonly steps = ['welcome', 'credentials', 'syncing'];
  readonly step = signal<Step>('welcome');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly currentStepIndex = () => this.steps.indexOf(this.step());

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    appPassword: ['', Validators.required],
  });

  async connect() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const { email, appPassword } = this.form.getRawValue();
    try {
      await this.api.connectImap({ email, appPassword }).toPromise();
      this.step.set('syncing');
      // Redirect to dashboard after 5s if no WebSocket event arrives
      setTimeout(() => this.goToDashboard(), 5000);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message
        ?? 'Could not connect. Check your Yahoo email and App Password.';
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }
}
