import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthStore } from '../../state/auth.store';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="space-y-6 max-w-xl">
      <div>
        <h1 class="text-xl font-semibold" style="color: var(--color-text)">Settings</h1>
        <p class="text-sm mt-0.5" style="color: var(--color-muted)">Manage your profile and preferences</p>
      </div>

      <!-- Profile card -->
      <div class="rounded-xl border p-6 space-y-5"
        style="background-color: var(--color-surface); border-color: var(--color-border)">
        <h2 class="text-sm font-semibold" style="color: var(--color-text)">Profile</h2>

        @if (saved()) {
          <div class="rounded-lg px-4 py-2.5 text-sm"
            style="background-color: rgba(34,197,94,0.1); color: var(--color-success); border: 1px solid var(--color-success)">
            Profile updated successfully.
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4">
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
          <button type="submit" [disabled]="loading() || form.invalid || form.pristine"
            class="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            style="background-color: var(--color-primary); color: #fff">
            {{ loading() ? 'Saving…' : 'Save changes' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly authStore = inject(AuthStore);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly saved = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: [{ value: '', disabled: true }],
  });

  ngOnInit() {
    const user = this.authStore.user();
    if (user) {
      this.form.patchValue({ name: user.name, email: user.email });
    }
  }

  save() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.saved.set(false);
    this.api.updateMe({ name: this.form.getRawValue().name }).subscribe({
      next: user => {
        this.authStore.setUser(user);
        this.saved.set(true);
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
