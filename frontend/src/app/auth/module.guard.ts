import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { PermissionsService } from './permissions.service';

/**
 * Guard por módulo — uso: `canActivate: [moduleGuard('customers')]`.
 *
 * Sustituye a `roleGuard`, que comparaba contra una lista de roles fija en el
 * código. Ahora la decisión viene de la configuración de la empresa, así que
 * hay que esperar a que los permisos estén cargados antes de responder.
 */
export const moduleGuard = (moduleKey: string): CanActivateFn => async () => {
  const permissions = inject(PermissionsService);
  const auth = inject(AuthService);
  const router = inject(Router);

  await permissions.load();
  if (permissions.can(moduleKey)) return true;

  return router.parseUrl(homeFor(auth.currentUser()?.role ?? '', permissions));
};

/**
 * A dónde mandar a quien no tiene acceso. Se prefiere su primera pantalla
 * disponible antes que un destino fijo: mandar a `/dashboard` a alguien que
 * tampoco lo tiene provocaría un bucle de redirecciones.
 */
export function homeFor(role: string, permissions: PermissionsService): string {
  if (role === 'SUPERADMIN') return '/admin/tenants';
  if (permissions.can('dashboard')) return '/dashboard';
  if (permissions.can('impulsador-panel')) return '/impulsador';

  const first = [
    'events', 'customers', 'inbox', 'campaigns', 'lists',
    'forms', 'ai-agents', 'visits', 'settings',
  ].find((m) => permissions.can(m));

  return first ? `/${routeOf(first)}` : '/change-password';
}

/** Las rutas que no coinciden con la clave del módulo. */
const ROUTE_OVERRIDES: Record<string, string> = {
  visits: 'visitas',
  templates: 'plantillas',
  'my-guests': 'mis-asistentes',
  'impulsador-panel': 'impulsador',
};

function routeOf(moduleKey: string): string {
  return ROUTE_OVERRIDES[moduleKey] ?? moduleKey;
}
