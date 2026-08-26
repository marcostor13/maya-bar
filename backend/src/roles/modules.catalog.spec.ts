import {
  ADMIN_LOCKED_MODULES,
  DEFAULT_ROLE_MODULES,
  MODULES,
  MODULE_KEYS,
  ROLE_LABELS,
  SYSTEM_ROLES,
} from './modules.catalog';
import {
  CRM_ROLES,
  EVENT_ROLES,
  MANAGE_ROLES,
  VISIT_ROLES,
} from '../auth/permissions';

/**
 * La matriz sembrada tiene que reproducir los accesos que la plataforma tenía
 * cuando los roles estaban fijos en el código. Sin este test, una regresión
 * silenciosa (un rol que pierde un módulo) solo se detectaría en producción.
 */
describe('catálogo de módulos', () => {
  it('no tiene claves repetidas', () => {
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length);
  });

  it('toda ruta del catálogo es única', () => {
    const routes = MODULES.map((m) => m.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('cada rol del sistema tiene etiqueta', () => {
    for (const role of SYSTEM_ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
  });

  it('todo módulo asignado existe en el catálogo', () => {
    for (const [role, modules] of Object.entries(DEFAULT_ROLE_MODULES)) {
      for (const m of modules) {
        expect(MODULE_KEYS).toContain(`${m}`);
        expect(`${role}:${MODULE_KEYS.includes(m)}`).toBe(`${role}:true`);
      }
    }
  });

  describe('coincide con los grupos de roles del backend', () => {
    /** Roles que hoy pasan `assertRole` para un grupo dado. */
    const rolesConAcceso = (modulo: string) =>
      SYSTEM_ROLES.filter((r) => DEFAULT_ROLE_MODULES[r].includes(modulo));

    it('Clientes y Listas coinciden con CRM_ROLES', () => {
      const esperado = CRM_ROLES.filter((r) => r !== 'SUPERADMIN').sort();
      expect(rolesConAcceso('customers').sort()).toEqual(esperado);
      expect(rolesConAcceso('lists').sort()).toEqual(esperado);
    });

    it('Eventos coincide con EVENT_ROLES', () => {
      expect(rolesConAcceso('events').sort()).toEqual(
        EVENT_ROLES.filter((r) => r !== 'SUPERADMIN').sort(),
      );
    });

    it('Visitas coincide con VISIT_ROLES', () => {
      expect(rolesConAcceso('visits').sort()).toEqual(
        VISIT_ROLES.filter((r) => r !== 'SUPERADMIN').sort(),
      );
    });

    it('Plantillas y Locales quedan en MANAGE_ROLES', () => {
      const esperado = MANAGE_ROLES.filter((r) => r !== 'SUPERADMIN').sort();
      expect(rolesConAcceso('templates').sort()).toEqual(esperado);
      expect(rolesConAcceso('locals').sort()).toEqual(esperado);
    });
  });

  describe('barandillas', () => {
    it('el administrador conserva Usuarios y Configuración', () => {
      for (const m of ADMIN_LOCKED_MODULES) {
        expect(DEFAULT_ROLE_MODULES['TENANT_ADMIN']).toContain(m);
      }
    });

    it('solo el administrador administra usuarios de partida', () => {
      const conUsuarios = SYSTEM_ROLES.filter((r) =>
        DEFAULT_ROLE_MODULES[r].includes('users'),
      );
      expect(conUsuarios).toEqual(['TENANT_ADMIN']);
    });

    it('el panel del impulsador es solo suyo', () => {
      const conPanel = SYSTEM_ROLES.filter((r) =>
        DEFAULT_ROLE_MODULES[r].includes('impulsador-panel'),
      );
      expect(conPanel).toEqual(['IMPULSADOR']);
    });

    it('ningún rol se queda sin ningún módulo', () => {
      for (const role of SYSTEM_ROLES) {
        expect(DEFAULT_ROLE_MODULES[role].length).toBeGreaterThan(0);
      }
    });
  });
});
