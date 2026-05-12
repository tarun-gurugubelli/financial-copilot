import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../state/auth.store';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center px-4" style="background-color: var(--color-bg)">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold" style="color: var(--color-text)">
            <span style="color: var(--color-primary)">Financial</span> Copilot
          </h1>
          <p class="text-sm mt-1" style="color: var(--color-muted)">Create your account</p>
        </div>

        <div class="rounded-xl border p-8" style="background-color: var(--color-surface); border-color: var(--color-border)">
          <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-5">

            @if (authStore.error()) {
              <div class="rounded-lg px-4 py-3 text-sm" style="background-color: rgba(239,68,68,0.1); color: var(--color-danger); border: 1px solid var(--color-danger)">
                {{ authStore.error() }}
              </div>
            }

            <div>
              <label class="block text-sm font-medium mb-1.5" style="color: var(--color-muted)">Full Name</label>
              <input formControlName="name" type="text" autocomplete="name"
                class="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                style="background-color: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text)"
                placeholder="John Doe">
            </div>

            <div>
              <label class="block text-sm font-medium mb-1.5" style="color: var(--color-muted)">Email</label>
              <input formControlName="email" type="email" autocomplete="email"
                class="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                style="background-color: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text)"
                placeholder="you@example.com">
            </div>

            <div>
              <label class="block text-sm font-medium mb-1.5" style="color: var(--color-muted)">Password</label>
              <input formControlName="password" type="password" autocomplete="new-password"
                class="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                style="background-color: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text)"
                placeholder="At least 8 characters">
            </div>

            <button type="submit" [disabled]="authStore.loading() || form.invalid"
              class="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
              style="background-color: var(--color-primary); color: #fff">
              {{ authStore.loading() ? 'Creating account…' : 'Create account' }}
            </button>

          </form>

          <p class="mt-6 text-center text-sm" style="color: var(--color-muted)">
            Already have an account?
            <a routerLink="/login" class="font-medium" style="color: var(--color-primary)">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  `,
})
export class RegisterComponent {
  readonly authStore = inject(AuthStore);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submit() {
    if (this.form.invalid) return;
    const { name, email, password } = this.form.getRawValue();
    this.authStore.register(name, email, password);
  }
}
