import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.parseUrl('/login');
  if (auth.currentUser()?.mustChangePassword && state.url !== '/change-password') {
    return router.parseUrl('/change-password');
  }
  return true;
};
