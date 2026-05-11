import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import type { User } from '../models/user.model';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = { user: null, loading: false, error: null };

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const api = inject(ApiService);
    const router = inject(Router);

    return {
      async login(email: string, password: string) {
        patchState(store, { loading: true, error: null });
        try {
          const res = await api.login({ email, password }).toPromise();
          patchState(store, { user: res!.user, loading: false });
          if (!res!.user.hasImapCredentials) {
            router.navigate(['/onboarding']);
          } else {
            router.navigate(['/dashboard']);
          }
        } catch (err: unknown) {
          const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Login failed';
          patchState(store, { loading: false, error: msg });
        }
      },

      async register(name: string, email: string, password: string) {
        patchState(store, { loading: true, error: null });
        try {
          const res = await api.register({ name, email, password }).toPromise();
          patchState(store, { user: res!.user, loading: false });
          router.navigate(['/onboarding']);
        } catch (err: unknown) {
          const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Registration failed';
          patchState(store, { loading: false, error: msg });
        }
      },

      async logout() {
        await api.logout().toPromise();
        patchState(store, { user: null });
        router.navigate(['/login']);
      },

      setUser(user: User) {
        patchState(store, { user });
      },

      clearError() {
        patchState(store, { error: null });
      },
    };
  }),
);
