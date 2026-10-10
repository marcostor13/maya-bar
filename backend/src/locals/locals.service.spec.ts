import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LocalsService } from './locals.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const tenantId = tenantOid.toString();

function buildQuery(result: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'populate']) q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(result);
  return q;
}

function makeLocalDoc(overrides: Record<string, unknown> = {}) {
  const doc: any = {
    _id: new Types.ObjectId(),
    tenantId: tenantOid,
    name: 'Sede Miraflores',
    type: 'bar',
    address: 'Av. Larco 123',
    phone: '+51 999 888 777',
    email: 'miraflores@bar.pe',
    timezone: 'America/Bogota',
    hours: [{ day: 1, open: '18:00', close: '02:00' }],
    tableCount: 12,
    isActive: true,
    save: jest.fn(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  return doc;
}

function createMockModel() {
  const model: any = jest.fn();
  model.find = jest.fn().mockReturnValue(buildQuery([]));
  model.findById = jest.fn().mockReturnValue(buildQuery(null));
  return model;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('LocalsService', () => {
  let service: LocalsService;
  let localModel: any;

  beforeEach(() => {
    localModel = createMockModel();
    service = new LocalsService(localModel as never);
  });

  function captureCreated() {
    const captured: { data?: any } = {};
    localModel.mockImplementation((data: any) => {
      captured.data = data;
      return makeLocalDoc(data);
    });
    return captured;
  }

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('crea el local en la empresa con la zona horaria de Lima por defecto', async () => {
      const captured = captureCreated();

      await service.create(tenantId, { name: 'Sede Centro', type: 'cafe' });

      expect(captured.data.tenantId.toString()).toBe(tenantId);
      expect(captured.data).toMatchObject({
        name: 'Sede Centro',
        type: 'cafe',
        timezone: 'America/Lima',
      });
    });

    it('respeta la zona horaria enviada', async () => {
      const captured = captureCreated();

      await service.create(tenantId, {
        name: 'Sede Madrid',
        timezone: 'Europe/Madrid',
      });

      expect(captured.data.timezone).toBe('Europe/Madrid');
    });

    it('la empresa del token manda sobre la que venga en el cuerpo', async () => {
      const captured = captureCreated();

      const body = {
        name: 'Sede',
        tenantId: new Types.ObjectId().toString(),
      };

      await service.create(tenantId, body);

      expect(captured.data.tenantId.toString()).toBe(tenantId);
    });
  });

  // ─── findAll / findAllByTenant ─────────────────────────────────────────────

  describe('findAll (superadministrador)', () => {
    it('lista los locales activos de toda la plataforma con su empresa', async () => {
      const query = buildQuery([]);
      localModel.find.mockReturnValue(query);

      await service.findAll();

      expect(localModel.find).toHaveBeenCalledWith({ isActive: true });
      expect(query.populate).toHaveBeenCalledWith(
        'tenantId',
        'name email slug',
      );
      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  describe('findAllByTenant', () => {
    it('sin asignación devuelve todos los locales activos de la empresa', async () => {
      await service.findAllByTenant(tenantId);

      const filter = localModel.find.mock.calls[0][0];
      expect(Object.keys(filter).sort()).toEqual(['isActive', 'tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.isActive).toBe(true);
    });

    it('una lista vacía de locales no restringe nada', async () => {
      await service.findAllByTenant(tenantId, []);

      expect(localModel.find.mock.calls[0][0]).not.toHaveProperty('_id');
    });

    it('con locales asignados restringe a esos, siempre dentro de la empresa', async () => {
      const a = new Types.ObjectId().toString();
      const b = new Types.ObjectId().toString();

      await service.findAllByTenant(tenantId, [a, b]);

      const filter = localModel.find.mock.calls[0][0];
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter._id.$in.map((id: Types.ObjectId) => id.toString())).toEqual(
        [a, b],
      );
    });

    it('descarta los ids mal formados de la asignación', async () => {
      const valid = new Types.ObjectId().toString();

      await service.findAllByTenant(tenantId, ['no-es-un-id', valid]);

      const filter = localModel.find.mock.calls[0][0];
      expect(filter._id.$in.map((id: Types.ObjectId) => id.toString())).toEqual(
        [valid],
      );
    });
  });

  // ─── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('devuelve el local de la empresa', async () => {
      const doc = makeLocalDoc();
      localModel.findById.mockReturnValue(buildQuery(doc));

      await expect(
        service.findById(doc._id.toString(), tenantId),
      ).resolves.toBe(doc);
    });

    it('id inexistente lanza NotFoundException', async () => {
      await expect(service.findById('x', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('un local de otra empresa lanza ForbiddenException', async () => {
      localModel.findById.mockReturnValue(
        buildQuery(makeLocalDoc({ tenantId: new Types.ObjectId() })),
      );

      await expect(service.findById('x', tenantId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── update / archive ──────────────────────────────────────────────────────

  describe('update', () => {
    it('aplica los cambios y guarda', async () => {
      const doc = makeLocalDoc();
      localModel.findById.mockReturnValue(buildQuery(doc));

      await service.update(doc._id.toString(), tenantId, {
        name: 'Sede Barranco',
        tableCount: 20,
      });

      expect(doc.name).toBe('Sede Barranco');
      expect(doc.tableCount).toBe(20);
      expect(doc.address).toBe('Av. Larco 123');
      expect(doc.save).toHaveBeenCalledTimes(1);
    });

    it('un local de otra empresa no se modifica', async () => {
      const doc = makeLocalDoc({ tenantId: new Types.ObjectId() });
      localModel.findById.mockReturnValue(buildQuery(doc));

      await expect(
        service.update('x', tenantId, { name: 'Hackeado' }),
      ).rejects.toThrow(ForbiddenException);
      expect(doc.name).toBe('Sede Miraflores');
      expect(doc.save).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('desactiva el local sin borrarlo', async () => {
      const doc = makeLocalDoc();
      localModel.findById.mockReturnValue(buildQuery(doc));

      const result = await service.archive(doc._id.toString(), tenantId);

      expect(result.isActive).toBe(false);
      expect(doc.save).toHaveBeenCalledTimes(1);
    });

    it('un local de otra empresa no se archiva', async () => {
      const doc = makeLocalDoc({ tenantId: new Types.ObjectId() });
      localModel.findById.mockReturnValue(buildQuery(doc));

      await expect(service.archive('x', tenantId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(doc.isActive).toBe(true);
    });
  });

  // ─── clone ──────────────────────────────────────────────────────────────────

  describe('clone', () => {
    it('copia la configuración a un local nuevo de la misma empresa', async () => {
      const source = makeLocalDoc();
      localModel.findById.mockReturnValue(buildQuery(source));
      const captured = captureCreated();

      await service.clone(source._id.toString(), tenantId);

      expect(captured.data).toEqual({
        tenantId: tenantOid,
        name: 'Sede Miraflores (copia)',
        type: 'bar',
        address: 'Av. Larco 123',
        phone: '+51 999 888 777',
        email: 'miraflores@bar.pe',
        timezone: 'America/Bogota',
        hours: source.hours,
        tableCount: 12,
      });
      expect(source.save).not.toHaveBeenCalled();
    });

    it('un local de otra empresa no se puede clonar', async () => {
      localModel.findById.mockReturnValue(
        buildQuery(makeLocalDoc({ tenantId: new Types.ObjectId() })),
      );

      await expect(service.clone('x', tenantId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(localModel).not.toHaveBeenCalled();
    });

    it('id inexistente lanza NotFoundException', async () => {
      await expect(service.clone('x', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
