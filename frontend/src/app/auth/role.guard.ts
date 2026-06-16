import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Factory guard — usage: canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER')]
 * Redirects unauthenticated or wrong-role users to their home page.
 */
export const roleGuard = (...allowed: string[]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = auth.currentUser()?.role ?? '';
    if (allowed.includes(role)) return true;
    if (role === 'SUPERADMIN') return router.parseUrl('/admin/tenants');
    if (role === 'IMPULSADOR') return router.parseUrl('/impulsador');
    return router.parseUrl('/dashboard');
  };
