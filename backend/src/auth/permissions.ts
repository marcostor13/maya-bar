import { ForbiddenException } from '@nestjs/common';

export interface AuthReq {
  user: {
    userId: string;
    email: string;
    role: string;
    tenantId: string;
    localIds: string[];
  };
}

export type UserRole =
  | 'SUPERADMIN'
  | 'TENANT_ADMIN'
  | 'MANAGER'
  | 'HOST'
  | 'SERVER'
  | 'KITCHEN'
  | 'BAR'
  | 'MARKETING'
  | 'IMPULSADOR';

// Role groups
export const MANAGE_ROLES: UserRole[] = ['TENANT_ADMIN', 'MANAGER'];
export const OPERATIONAL_ROLES: UserRole[] = [
  'TENANT_ADMIN',
  'MANAGER',
  'HOST',
  'SERVER',
  'KITCHEN',
  'BAR',
];
export const AVAILABILITY_ROLES: UserRole[] = [
  'TENANT_ADMIN',
  'MANAGER',
  'KITCHEN',
  'BAR',
];
export const ADVANCE_ORDER_ROLES: UserRole[] = [
  'TENANT_ADMIN',
  'MANAGER',
  'SERVER',
  'KITCHEN',
  'BAR',
];
export const ADMIN_ONLY: UserRole[] = ['TENANT_ADMIN'];
export const CRM_ROLES: UserRole[] = [
  'TENANT_ADMIN',
  'MANAGER',
  'MARKETING',
  'IMPULSADOR',
];
export const EVENT_ROLES: UserRole[] = [
  'TENANT_ADMIN',
  'MANAGER',
  'MARKETING',
  'IMPULSADOR',
];
export const VISIT_ROLES: UserRole[] = [
  'TENANT_ADMIN',
  'MANAGER',
  'IMPULSADOR',
];

/** True when the role's data is scoped to the owner (not the whole tenant). */
export function isOwnerScoped(role: string): boolean {
  return role === 'IMPULSADOR';
}

/** Roles que trae la plataforma de fábrica. */
const SYSTEM_ROLE_KEYS = [
  'SUPERADMIN',
  'TENANT_ADMIN',
  'MANAGER',
  'HOST',
  'SERVER',
  'KITCHEN',
  'BAR',
  'MARKETING',
  'IMPULSADOR',
];

/**
 * Throws ForbiddenException if the user's role is not in the allowed list.
 * SUPERADMIN bypasses all tenant-level role checks.
 *
 * Los roles propios de una empresa no aparecen en estas listas y nunca podrían
 * pasar la comprobación. Para ellos manda la matriz configurable, que ya se ha
 * aplicado antes en `ModuleGuard`: si llegan hasta aquí es porque tienen el
 * módulo y la acción concedidos. Estas listas siguen gobernando a los roles del
 * sistema, donde expresan distinciones más finas que la matriz no representa.
 */
export function assertRole(userRole: string, allowed: string[]): void {
  if (userRole === 'SUPERADMIN') return;
  if (!SYSTEM_ROLE_KEYS.includes(userRole)) return;
  if (!allowed.includes(userRole))
    throw new ForbiddenException('Permiso insuficiente');
}

/**
 * Módulo de la plataforma al que pertenece cada grupo de roles heredado. Es el
 * puente entre `assertRole`, que compara contra una lista fija, y la matriz
 * configurable por empresa.
 */
export const GROUP_MODULE: Record<string, string> = {
  CRM_ROLES: 'customers',
  EVENT_ROLES: 'events',
  VISIT_ROLES: 'visits',
};
