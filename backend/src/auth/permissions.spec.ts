import { ForbiddenException } from '@nestjs/common';
import {
  ADMIN_ONLY,
  CRM_ROLES,
  GROUP_MODULE,
  LEAD_SUPERVISOR_ROLES,
  MANAGE_ROLES,
  VISIT_ROLES,
  assertRole,
  isLeadSupervisor,
  isOwnerScoped,
} from './permissions';
import { MODULE_KEYS } from '../roles/modules.catalog';

describe('permissions', () => {
  describe('assertRole', () => {
    it('deja pasar a un rol incluido en la lista', () => {
      expect(() => assertRole('MANAGER', MANAGE_ROLES)).not.toThrow();
    });

    it('rechaza a un rol del sistema que no está en la lista', () => {
      expect(() => assertRole('HOST', MANAGE_ROLES)).toThrow(
        ForbiddenException,
      );
      expect(() => assertRole('MANAGER', ADMIN_ONLY)).toThrow(
        'Permiso insuficiente',
      );
    });

    it('SUPERADMIN pasa aunque la lista no lo nombre o esté vacía', () => {
      expect(() => assertRole('SUPERADMIN', ADMIN_ONLY)).not.toThrow();
      expect(() => assertRole('SUPERADMIN', [])).not.toThrow();
    });

    it('con la lista vacía ningún rol de empresa del sistema pasa', () => {
      expect(() => assertRole('TENANT_ADMIN', [])).toThrow(ForbiddenException);
    });

    it('un rol propio de la empresa no se bloquea: ya lo filtró la matriz', () => {
      expect(() => assertRole('CUSTOM_VENTAS', ADMIN_ONLY)).not.toThrow();
    });

    it('compara la clave exacta: un rol del sistema en minúsculas se trata como propio', () => {
      expect(() => assertRole('host', ADMIN_ONLY)).not.toThrow();
    });

    it.each([
      ['MARKETING', CRM_ROLES, true],
      ['IMPULSADOR', CRM_ROLES, true],
      ['KITCHEN', CRM_ROLES, false],
      ['IMPULSADOR', VISIT_ROLES, true],
      ['MARKETING', VISIT_ROLES, false],
    ])(
      '%s contra su grupo',
      (role: string, group: string[], allowed: boolean) => {
        const check = () => assertRole(role, group);
        if (allowed) expect(check).not.toThrow();
        else expect(check).toThrow(ForbiddenException);
      },
    );
  });

  describe('isOwnerScoped', () => {
    it('solo el impulsador trabaja sobre sus propios datos', () => {
      expect(isOwnerScoped('IMPULSADOR')).toBe(true);
      for (const role of [
        'SUPERADMIN',
        'TENANT_ADMIN',
        'MANAGER',
        'MARKETING',
        'CUSTOM_VENTAS',
        '',
      ])
        expect(isOwnerScoped(role)).toBe(false);
    });
  });

  describe('isLeadSupervisor', () => {
    it('supervisan el reparto el superadministrador, el administrador y el gerente', () => {
      for (const role of LEAD_SUPERVISOR_ROLES)
        expect(isLeadSupervisor(role)).toBe(true);
    });

    it('marketing, impulsadores y roles propios no supervisan', () => {
      for (const role of ['MARKETING', 'IMPULSADOR', 'CUSTOM_VENTAS', ''])
        expect(isLeadSupervisor(role)).toBe(false);
    });
  });

  describe('GROUP_MODULE', () => {
    it('cada grupo heredado apunta a un módulo vigente del catálogo', () => {
      for (const moduleKey of Object.values(GROUP_MODULE))
        expect(MODULE_KEYS).toContain(moduleKey);
    });
  });
});
