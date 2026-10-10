import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RolesService } from './roles.service';
import {
  DEFAULT_ROLE_MODULES,
  MODULE_KEYS,
  MODULES,
  ROLE_LABELS,
} from './modules.catalog';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const tenantId = tenantOid.toString();
const otherTenantId = new Types.ObjectId().toString();

const SYSTEM_KEYS = Object.keys(DEFAULT_ROLE_MODULES);

function buildQuery(result: unknown) {
  const q = {
    sort: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  };
  q.sort.mockReturnValue(q);
  return q;
}

function role(key: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    tenantId: tenantOid,
    key,
    label: ROLE_LABELS[key] ?? key,
    modules: DEFAULT_ROLE_MODULES[key] ?? [],
    actions: undefined as Record<string, string[]> | undefined,
    isSystem: true,
    ...overrides,
  };
}

function createMockModel() {
  return {
    // Por defecto la empresa ya tiene sembrados los roles del sistema.
    find: jest
      .fn()
      .mockImplementation(() => buildQuery(SYSTEM_KEYS.map((k) => role(k)))),
    findOne: jest.fn().mockReturnValue(buildQuery(null)),
    findOneAndUpdate: jest.fn().mockReturnValue(buildQuery(null)),
    insertMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((data: unknown) => data),
    deleteOne: jest.fn().mockReturnValue(buildQuery({ deletedCount: 1 })),
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('RolesService', () => {
  let service: RolesService;
  let roleModel: ReturnType<typeof createMockModel>;

  beforeEach(() => {
    roleModel = createMockModel();
    service = new RolesService(roleModel as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('catalog', () => {
    it('devuelve los módulos visibles de la plataforma', () => {
      expect(service.catalog()).toEqual({ modules: MODULES });
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('siembra todos los roles del sistema en una empresa nueva', async () => {
      const seeded = [role('MANAGER'), role('TENANT_ADMIN')];
      roleModel.find
        .mockReturnValueOnce(buildQuery([]))
        .mockReturnValueOnce(buildQuery(seeded));

      const result = await service.findAll(tenantId);

      const [docs, options] = roleModel.insertMany.mock.calls[0];
      expect(docs.map((d: { key: string }) => d.key).sort()).toEqual(
        [...SYSTEM_KEYS].sort(),
      );
      for (const doc of docs) {
        expect(doc.tenantId.toString()).toBe(tenantId);
        expect(doc.isSystem).toBe(true);
        expect(doc.label).toBe(ROLE_LABELS[doc.key]);
        expect(doc.modules).toEqual(DEFAULT_ROLE_MODULES[doc.key]);
      }
      expect(options).toEqual({ ordered: false });
      expect(result).toBe(seeded);
    });

    it('filtra por empresa tanto al leer como al releer tras sembrar', async () => {
      roleModel.find
        .mockReturnValueOnce(buildQuery([]))
        .mockReturnValueOnce(buildQuery([]));

      await service.findAll(tenantId);

      expect(roleModel.find).toHaveBeenCalledTimes(2);
      for (const [filter] of roleModel.find.mock.calls) {
        expect(Object.keys(filter)).toEqual(['tenantId']);
        expect(filter.tenantId.toString()).toBe(tenantId);
      }
    });

    it('solo siembra los roles que faltan y no toca los existentes', async () => {
      const existing = SYSTEM_KEYS.filter((k) => k !== 'MARKETING').map((k) =>
        role(k),
      );
      roleModel.find
        .mockReturnValueOnce(buildQuery(existing))
        .mockReturnValueOnce(buildQuery([]));

      await service.findAll(tenantId);

      const [docs] = roleModel.insertMany.mock.calls[0];
      expect(docs.map((d: { key: string }) => d.key)).toEqual(['MARKETING']);
    });

    it('con todos los roles presentes no inserta y los devuelve ordenados por clave', async () => {
      const custom = role('CUSTOM_VENTAS', { isSystem: false });
      roleModel.find.mockReturnValueOnce(
        buildQuery([...SYSTEM_KEYS.map((k) => role(k)).reverse(), custom]),
      );

      const result = await service.findAll(tenantId);

      expect(roleModel.insertMany).not.toHaveBeenCalled();
      expect(result.map((r) => r.key)).toEqual(
        [...SYSTEM_KEYS, 'CUSTOM_VENTAS'].sort((a, b) => a.localeCompare(b)),
      );
    });

    it('si la siembra choca con otra petición simultánea no falla', async () => {
      const seeded = [role('MANAGER')];
      roleModel.find
        .mockReturnValueOnce(buildQuery([]))
        .mockReturnValueOnce(buildQuery(seeded));
      roleModel.insertMany.mockRejectedValue({ code: 11000 });

      await expect(service.findAll(tenantId)).resolves.toBe(seeded);
    });
  });

  // ─── accessFor / modulesFor ────────────────────────────────────────────────

  describe('accessFor', () => {
    it('SUPERADMIN recibe todos los módulos sin consultar la base', async () => {
      const access = await service.accessFor(tenantId, 'SUPERADMIN');

      expect(access).toEqual({ modules: MODULE_KEYS, actions: {} });
      expect(roleModel.findOne).not.toHaveBeenCalled();
    });

    it('busca el rol por empresa y clave', async () => {
      await service.accessFor(tenantId, 'MANAGER');

      const filter = roleModel.findOne.mock.calls[0][0];
      expect(Object.keys(filter).sort()).toEqual(['key', 'tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.key).toBe('MANAGER');
    });

    it('sin documento usa la matriz de partida del rol', async () => {
      const access = await service.accessFor(tenantId, 'MARKETING');

      expect(access.modules).toEqual(DEFAULT_ROLE_MODULES.MARKETING);
      expect(access.actions).toEqual({});
    });

    it('un rol propio sin documento no tiene acceso a nada', async () => {
      const access = await service.accessFor(tenantId, 'CUSTOM_FANTASMA');

      expect(access.modules).toEqual([]);
    });

    it('devuelve los módulos y acciones guardados por la empresa', async () => {
      roleModel.findOne.mockReturnValue(
        buildQuery(
          role('MARKETING', {
            modules: ['customers', 'leads'],
            actions: { customers: ['create'] },
          }),
        ),
      );

      const access = await service.accessFor(tenantId, 'MARKETING');

      expect(access).toEqual({
        modules: ['customers', 'leads'],
        actions: { customers: ['create'] },
      });
    });

    it('oculta los módulos retirados aunque sigan guardados en el rol', async () => {
      roleModel.findOne.mockReturnValue(
        buildQuery(
          role('MANAGER', {
            modules: ['dashboard', 'menu', 'orders', 'kds', 'reservations'],
          }),
        ),
      );

      const access = await service.accessFor(tenantId, 'MANAGER');

      expect(access.modules).toEqual(['dashboard']);
    });

    it('el administrador conserva Usuarios y Configuración aunque se los hayan quitado', async () => {
      roleModel.findOne.mockReturnValue(
        buildQuery(role('TENANT_ADMIN', { modules: ['dashboard'] })),
      );

      const access = await service.accessFor(tenantId, 'TENANT_ADMIN');

      expect(access.modules).toEqual(['dashboard', 'users', 'settings']);
    });

    it('los módulos bloqueados no se regalan a otros roles', async () => {
      roleModel.findOne.mockReturnValue(
        buildQuery(role('MANAGER', { modules: ['dashboard'] })),
      );

      const access = await service.accessFor(tenantId, 'MANAGER');

      expect(access.modules).toEqual(['dashboard']);
    });

    it('modulesFor devuelve solo los módulos del acceso', async () => {
      roleModel.findOne.mockReturnValue(
        buildQuery(role('HOST', { modules: ['dashboard'] })),
      );

      await expect(service.modulesFor(tenantId, 'HOST')).resolves.toEqual([
        'dashboard',
      ]);
    });
  });

  describe('caché de accesos', () => {
    it('la segunda consulta del mismo rol no vuelve a la base', async () => {
      await service.accessFor(tenantId, 'MANAGER');
      await service.accessFor(tenantId, 'MANAGER');

      expect(roleModel.findOne).toHaveBeenCalledTimes(1);
    });

    it('no comparte entradas entre empresas ni entre roles', async () => {
      roleModel.findOne
        .mockReturnValueOnce(
          buildQuery(role('MANAGER', { modules: ['customers'] })),
        )
        .mockReturnValueOnce(
          buildQuery(role('MANAGER', { modules: ['leads'] })),
        )
        .mockReturnValueOnce(buildQuery(role('HOST', { modules: ['inbox'] })));

      const mine = await service.accessFor(tenantId, 'MANAGER');
      const theirs = await service.accessFor(otherTenantId, 'MANAGER');
      const host = await service.accessFor(tenantId, 'HOST');

      expect(mine.modules).toEqual(['customers']);
      expect(theirs.modules).toEqual(['leads']);
      expect(host.modules).toEqual(['inbox']);
      expect(roleModel.findOne.mock.calls[1][0].tenantId.toString()).toBe(
        otherTenantId,
      );
    });

    it('caduca a los 30 segundos y relee la configuración', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-01T10:00:00Z'));
      roleModel.findOne
        .mockReturnValueOnce(
          buildQuery(role('MANAGER', { modules: ['customers'] })),
        )
        .mockReturnValueOnce(buildQuery(role('MANAGER', { modules: [] })));

      await service.accessFor(tenantId, 'MANAGER');
      jest.setSystemTime(new Date('2026-01-01T10:00:29Z'));
      const stillCached = await service.accessFor(tenantId, 'MANAGER');
      jest.setSystemTime(new Date('2026-01-01T10:00:31Z'));
      const refreshed = await service.accessFor(tenantId, 'MANAGER');

      expect(stillCached.modules).toEqual(['customers']);
      expect(refreshed.modules).toEqual([]);
      expect(roleModel.findOne).toHaveBeenCalledTimes(2);
    });
  });

  // ─── canAct ─────────────────────────────────────────────────────────────────

  describe('canAct', () => {
    it('SUPERADMIN puede todo sin consultar', async () => {
      await expect(
        service.canAct(tenantId, 'SUPERADMIN', 'customers', 'delete'),
      ).resolves.toBe(true);
      expect(roleModel.findOne).not.toHaveBeenCalled();
    });

    it('sin entrada para el módulo se permiten todas las acciones', async () => {
      roleModel.findOne.mockReturnValue(
        buildQuery(role('MANAGER', { actions: { leads: [] } })),
      );

      await expect(
        service.canAct(tenantId, 'MANAGER', 'customers', 'delete'),
      ).resolves.toBe(true);
    });

    it('con entrada solo permite las acciones listadas', async () => {
      roleModel.findOne.mockReturnValue(
        buildQuery(role('MANAGER', { actions: { customers: ['create'] } })),
      );

      await expect(
        service.canAct(tenantId, 'MANAGER', 'customers', 'create'),
      ).resolves.toBe(true);
      await expect(
        service.canAct(tenantId, 'MANAGER', 'customers', 'delete'),
      ).resolves.toBe(false);
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    function stubUpdated(doc: unknown) {
      roleModel.findOneAndUpdate.mockReturnValue(buildQuery(doc));
    }

    it('rechaza módulos que no existen en el catálogo sin escribir nada', async () => {
      const attempt = service.update(tenantId, 'MANAGER', [
        'customers',
        'inventado',
      ]);

      await expect(attempt).rejects.toThrow(BadRequestException);
      await expect(attempt).rejects.toThrow('Módulos desconocidos: inventado');
      expect(roleModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rechaza los módulos retirados del catálogo', async () => {
      await expect(
        service.update(tenantId, 'MANAGER', ['menu']),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza acciones desconocidas sin escribir nada', async () => {
      const attempt = service.update(tenantId, 'MANAGER', ['customers'], {
        customers: ['create', 'exportar'],
      });

      await expect(attempt).rejects.toThrow(
        'Acciones desconocidas en customers: exportar',
      );
      expect(roleModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('guarda los módulos del rol de esa empresa', async () => {
      const updated = role('MANAGER', { modules: ['customers', 'leads'] });
      stubUpdated(updated);

      const result = await service.update(tenantId, 'MANAGER', [
        'customers',
        'leads',
      ]);

      const [filter, change, options] =
        roleModel.findOneAndUpdate.mock.calls[0];
      expect(Object.keys(filter).sort()).toEqual(['key', 'tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.key).toBe('MANAGER');
      expect(change).toEqual({ $set: { modules: ['customers', 'leads'] } });
      expect(options).toEqual({ new: true });
      expect(result).toBe(updated);
    });

    it('sin acciones en la petición no pisa las que hubiera guardadas', async () => {
      stubUpdated(role('MANAGER'));

      await service.update(tenantId, 'MANAGER', ['customers']);

      const change = roleModel.findOneAndUpdate.mock.calls[0][1];
      expect(change.$set).not.toHaveProperty('actions');
    });

    it('descarta las acciones de módulos que el rol ya no tiene', async () => {
      stubUpdated(role('MANAGER'));

      await service.update(tenantId, 'MANAGER', ['customers'], {
        customers: ['create'],
        leads: ['delete'],
      });

      const change = roleModel.findOneAndUpdate.mock.calls[0][1];
      expect(change.$set.actions).toEqual({ customers: ['create'] });
    });

    it('al administrador le añade los módulos bloqueados aunque no vengan', async () => {
      stubUpdated(role('TENANT_ADMIN'));

      await service.update(tenantId, 'TENANT_ADMIN', ['dashboard'], {
        users: ['create'],
      });

      const change = roleModel.findOneAndUpdate.mock.calls[0][1];
      expect(change.$set.modules).toEqual(['dashboard', 'users', 'settings']);
      expect(change.$set.actions).toEqual({ users: ['create'] });
    });

    it('siembra los roles antes de editar, para que un rol aún no creado exista', async () => {
      roleModel.find
        .mockReturnValueOnce(buildQuery([]))
        .mockReturnValueOnce(buildQuery([]));
      stubUpdated(role('MANAGER'));

      await service.update(tenantId, 'MANAGER', ['customers']);

      expect(roleModel.insertMany.mock.invocationCallOrder[0]).toBeLessThan(
        roleModel.findOneAndUpdate.mock.invocationCallOrder[0],
      );
    });

    it('rol inexistente en la empresa lanza NotFoundException', async () => {
      stubUpdated(null);

      await expect(
        service.update(tenantId, 'CUSTOM_OTRA_EMPRESA', ['customers']),
      ).rejects.toThrow(NotFoundException);
    });

    it('invalida la caché para que el cambio se aplique al momento', async () => {
      roleModel.findOne
        .mockReturnValueOnce(
          buildQuery(role('MANAGER', { modules: ['customers'] })),
        )
        .mockReturnValueOnce(buildQuery(role('MANAGER', { modules: [] })));
      stubUpdated(role('MANAGER', { modules: [] }));

      await service.accessFor(tenantId, 'MANAGER');
      await service.update(tenantId, 'MANAGER', []);
      const access = await service.accessFor(tenantId, 'MANAGER');

      expect(access.modules).toEqual([]);
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('rechaza un nombre vacío o solo con espacios', async () => {
      await expect(service.create(tenantId, '   ')).rejects.toThrow(
        BadRequestException,
      );
      expect(roleModel.create).not.toHaveBeenCalled();
    });

    it('rechaza un nombre del que no sale ninguna clave', async () => {
      await expect(service.create(tenantId, '¡¿!?')).rejects.toThrow(
        'El nombre no es válido',
      );
      expect(roleModel.create).not.toHaveBeenCalled();
    });

    it('crea el rol sin accesos, con clave derivada del nombre y prefijo propio', async () => {
      await service.create(tenantId, '  Jefé de Ventas  ');

      const data = roleModel.create.mock.calls[0][0];
      expect(data.tenantId.toString()).toBe(tenantId);
      expect(data).toMatchObject({
        key: 'CUSTOM_JEFE_DE_VENTAS',
        label: 'Jefé de Ventas',
        modules: [],
        actions: {},
        isSystem: false,
      });
    });

    it('un nombre igual al de un rol del sistema no choca con su clave', async () => {
      await service.create(tenantId, 'Manager');

      expect(roleModel.create.mock.calls[0][0].key).toBe('CUSTOM_MANAGER');
    });

    it('busca duplicados dentro de la misma empresa', async () => {
      await service.create(tenantId, 'Ventas');

      const filter = roleModel.findOne.mock.calls[0][0];
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.key).toBe('CUSTOM_VENTAS');
    });

    it('nombre repetido lanza ConflictException y no crea nada', async () => {
      roleModel.findOne.mockReturnValue(
        buildQuery(role('CUSTOM_VENTAS', { isSystem: false })),
      );

      await expect(service.create(tenantId, 'ventas')).rejects.toThrow(
        ConflictException,
      );
      expect(roleModel.create).not.toHaveBeenCalled();
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('busca el rol por empresa y clave', async () => {
      await expect(
        service.remove(tenantId, 'CUSTOM_VENTAS', 0),
      ).rejects.toThrow(NotFoundException);

      const filter = roleModel.findOne.mock.calls[0][0];
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.key).toBe('CUSTOM_VENTAS');
      expect(roleModel.deleteOne).not.toHaveBeenCalled();
    });

    it('no permite eliminar un rol del sistema', async () => {
      roleModel.findOne.mockReturnValue(buildQuery(role('MANAGER')));

      await expect(service.remove(tenantId, 'MANAGER', 0)).rejects.toThrow(
        BadRequestException,
      );
      expect(roleModel.deleteOne).not.toHaveBeenCalled();
    });

    it('no elimina un rol que todavía tienen usuarios', async () => {
      roleModel.findOne.mockReturnValue(
        buildQuery(role('CUSTOM_VENTAS', { isSystem: false })),
      );

      const attempt = service.remove(tenantId, 'CUSTOM_VENTAS', 3);

      await expect(attempt).rejects.toThrow(ConflictException);
      await expect(attempt).rejects.toThrow('3 usuario(s) tienen este rol');
      expect(roleModel.deleteOne).not.toHaveBeenCalled();
    });

    it('elimina el rol propio sin usuarios e invalida su caché', async () => {
      const doc = role('CUSTOM_VENTAS', {
        isSystem: false,
        modules: ['customers'],
      });
      roleModel.findOne.mockReturnValue(buildQuery(doc));
      await service.accessFor(tenantId, 'CUSTOM_VENTAS');

      await service.remove(tenantId, 'CUSTOM_VENTAS', 0);

      expect(roleModel.deleteOne).toHaveBeenCalledWith({ _id: doc._id });
      roleModel.findOne.mockReturnValue(buildQuery(null));
      const access = await service.accessFor(tenantId, 'CUSTOM_VENTAS');
      expect(access.modules).toEqual([]);
    });
  });

  // ─── assignableKeys ────────────────────────────────────────────────────────

  describe('assignableKeys', () => {
    it('devuelve las claves de los roles de la empresa, propios incluidos', async () => {
      roleModel.find.mockReturnValueOnce(
        buildQuery([
          ...SYSTEM_KEYS.map((k) => role(k)),
          role('CUSTOM_VENTAS', { isSystem: false }),
        ]),
      );

      const keys = await service.assignableKeys(tenantId);

      expect(keys).toContain('CUSTOM_VENTAS');
      expect(keys).toHaveLength(SYSTEM_KEYS.length + 1);
      expect(keys).not.toContain('SUPERADMIN');
    });
  });
});
