import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MODULE_KEY, ModuleGuard, PlatformModule } from './module.guard';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantId = '665f1f1f1f1f1f1f1f1f1f1f';

function contextFor(req: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function request(role: string | undefined, method?: string) {
  return {
    method,
    user: role
      ? { userId: 'u1', email: 'a@b.pe', role, tenantId, localIds: [] }
      : undefined,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('ModuleGuard', () => {
  let roles: { accessFor: jest.Mock };

  beforeEach(() => {
    roles = { accessFor: jest.fn() };
  });

  function guardFor(moduleKey: string) {
    const Guard = ModuleGuard(moduleKey);
    return new Guard(roles);
  }

  function grant(modules: string[], actions?: Record<string, string[]>) {
    roles.accessFor.mockResolvedValue({ modules, actions });
  }

  describe('sesión y superadministrador', () => {
    it('sin usuario en la petición niega el acceso sin consultar la matriz', async () => {
      const allowed = await guardFor('customers').canActivate(
        contextFor(request(undefined, 'GET')),
      );

      expect(allowed).toBe(false);
      expect(roles.accessFor).not.toHaveBeenCalled();
    });

    it('SUPERADMIN pasa siempre, también para borrar, sin consultar la matriz', async () => {
      const allowed = await guardFor('customers').canActivate(
        contextFor(request('SUPERADMIN', 'DELETE')),
      );

      expect(allowed).toBe(true);
      expect(roles.accessFor).not.toHaveBeenCalled();
    });
  });

  describe('acceso al módulo', () => {
    it('consulta la matriz de la empresa y el rol del usuario', async () => {
      grant(['customers']);

      await guardFor('customers').canActivate(
        contextFor(request('MARKETING', 'GET')),
      );

      expect(roles.accessFor).toHaveBeenCalledWith(tenantId, 'MARKETING');
    });

    it('módulo no concedido lanza ForbiddenException con la etiqueta del módulo', async () => {
      grant(['dashboard', 'leads']);

      const attempt = guardFor('customers').canActivate(
        contextFor(request('HOST', 'GET')),
      );

      await expect(attempt).rejects.toThrow(ForbiddenException);
      await expect(attempt).rejects.toThrow(
        'Tu rol no tiene acceso a Clientes',
      );
    });

    it('un módulo fuera del catálogo se nombra por su clave', async () => {
      grant([]);

      await expect(
        guardFor('no-existe').canActivate(contextFor(request('HOST', 'GET'))),
      ).rejects.toThrow('Tu rol no tiene acceso a no-existe');
    });

    it('no basta con tener acciones configuradas: sin el módulo no se entra', async () => {
      grant(['dashboard'], { customers: ['create', 'edit', 'delete'] });

      await expect(
        guardFor('customers').canActivate(contextFor(request('HOST', 'POST'))),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('acciones por verbo HTTP', () => {
    it('GET no se restringe aunque el rol no tenga ninguna acción', async () => {
      grant(['customers'], { customers: [] });

      await expect(
        guardFor('customers').canActivate(
          contextFor(request('MARKETING', 'GET')),
        ),
      ).resolves.toBe(true);
    });

    it('sin verbo en la petición se trata como consulta', async () => {
      grant(['customers'], { customers: [] });

      await expect(
        guardFor('customers').canActivate(contextFor(request('MARKETING'))),
      ).resolves.toBe(true);
    });

    it.each([
      ['POST', 'create', 'crear'],
      ['PATCH', 'edit', 'editar'],
      ['PUT', 'edit', 'editar'],
      ['DELETE', 'delete', 'eliminar'],
    ])(
      '%s exige la acción %s',
      async (method: string, action: string, label: string) => {
        const others = ['create', 'edit', 'delete'].filter((a) => a !== action);
        grant(['customers'], { customers: others });

        const denied = guardFor('customers').canActivate(
          contextFor(request('MARKETING', method)),
        );
        await expect(denied).rejects.toThrow(ForbiddenException);
        await expect(denied).rejects.toThrow(
          `Tu rol puede ver Clientes, pero no ${label}`,
        );

        grant(['customers'], { customers: [action] });
        await expect(
          guardFor('customers').canActivate(
            contextFor(request('MARKETING', method)),
          ),
        ).resolves.toBe(true);
      },
    );

    it('el verbo se interpreta sin distinguir mayúsculas', async () => {
      grant(['customers'], { customers: ['create'] });

      await expect(
        guardFor('customers').canActivate(
          contextFor(request('MARKETING', 'delete')),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lista de acciones vacía bloquea cualquier escritura', async () => {
      grant(['customers'], { customers: [] });

      for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
        await expect(
          guardFor('customers').canActivate(
            contextFor(request('MARKETING', method)),
          ),
        ).rejects.toThrow(ForbiddenException);
      }
    });
  });

  describe('roles sin acciones configuradas', () => {
    it('sin entrada para el módulo se permiten todas las acciones', async () => {
      grant(['customers'], {});

      for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
        await expect(
          guardFor('customers').canActivate(
            contextFor(request('MANAGER', method)),
          ),
        ).resolves.toBe(true);
      }
    });

    it('sin mapa de acciones (rol anterior a las acciones) se permite todo', async () => {
      grant(['customers'], undefined);

      await expect(
        guardFor('customers').canActivate(
          contextFor(request('MANAGER', 'DELETE')),
        ),
      ).resolves.toBe(true);
    });

    it('las restricciones de otro módulo no afectan a este', async () => {
      grant(['customers', 'leads'], { leads: [] });

      await expect(
        guardFor('customers').canActivate(
          contextFor(request('MANAGER', 'DELETE')),
        ),
      ).resolves.toBe(true);
    });
  });

  describe('PlatformModule', () => {
    it('anota la clave del módulo en el controlador', () => {
      @PlatformModule('leads')
      class Controlador {}

      expect(Reflect.getMetadata(MODULE_KEY, Controlador)).toBe('leads');
    });
  });
});
