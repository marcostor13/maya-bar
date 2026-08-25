import { Signal, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

export interface Roles {
  /** Rol actual del usuario autenticado ('' si no hay sesión). */
  role: Signal<string>;
  /** TENANT_ADMIN o MANAGER: puede editar/eliminar. */
  canManage: Signal<boolean>;
  /** TENANT_ADMIN, MANAGER o IMPULSADOR: puede crear. */
  canCreate: Signal<boolean>;
  isImpulsador: Signal<boolean>;
  /** Código de referido del usuario (impulsadores). */
  referralCode: Signal<string | null>;
}

/**
 * Helper de roles basado en signals sobre AuthService.
 * Debe llamarse en un contexto de inyección (campo de clase o constructor).
 */
export function injectRoles(): Roles {
  const auth = inject(AuthService);
  const role = computed(() => auth.currentUser()?.role ?? '');
  return {
    role,
    canManage: computed(() => ['TENANT_ADMIN', 'MANAGER'].includes(role())),
    canCreate: computed(() => ['TENANT_ADMIN', 'MANAGER', 'IMPULSADOR'].includes(role())),
    isImpulsador: computed(() => role() === 'IMPULSADOR'),
    referralCode: computed(() => auth.currentUser()?.referralCode ?? null),
  };
}
