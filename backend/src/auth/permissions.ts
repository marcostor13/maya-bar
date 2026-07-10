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

/**
 * Throws ForbiddenException if the user's role is not in the allowed list.
 * SUPERADMIN bypasses all tenant-level role checks.
 */
export function assertRole(userRole: string, allowed: string[]): void {
  if (userRole === 'SUPERADMIN') return;
  if (!allowed.includes(userRole))
    throw new ForbiddenException('Permiso insuficiente');
}
