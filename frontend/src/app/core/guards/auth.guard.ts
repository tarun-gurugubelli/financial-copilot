import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthStore } from '../../state/auth.store';
import { catchError, map, of } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const api = inject(ApiService);
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (authStore.user()) return true;

  return api.getMe().pipe(
    map((user) => {
      authStore.setUser(user);
      return true;
    }),
    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    }),
  );
};
