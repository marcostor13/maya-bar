import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantsService } from './tenants.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const tenantId = tenantOid.toString();

function buildQuery(result: unknown) {
  const q = {
    sort: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  };
  q.sort.mockReturnValue(q);
  return q;
}

function createTenantModel() {
  const model: any = jest.fn();
  model.find = jest.fn().mockReturnValue(buildQuery([]));
  // `create` espera el findOne directamente, sin `.exec()`.
  model.findOne = jest.fn().mockResolvedValue(null);
  model.findById = jest.fn().mockReturnValue(buildQuery(null));
  model.findByIdAndUpdate = jest.fn().mockReturnValue(buildQuery(null));
  model.deleteOne = jest.fn().mockReturnValue(buildQuery({ deletedCount: 1 }));
  model.schema = { path: jest.fn().mockReturnValue(undefined) };
  return model;
}

/** Modelo registrado en la conexión, con o sin campo `tenantId`. */
function registeredModel(tenantIdType?: 'ObjectId' | 'String' | 'Mixed') {
  return {
    schema: {
      path: jest.fn((name: string) =>
        name === 'tenantId' && tenantIdType
          ? { instance: tenantIdType }
          : undefined,
      ),
    },
    deleteMany: jest.fn().mockReturnValue(buildQuery({ deletedCount: 0 })),
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('TenantsService', () => {
  let service: TenantsService;
  let tenantModel: any;
  let connection: { models: Record<string, any> };
  let auditModel: { create: jest.Mock };

  beforeEach(() => {
    tenantModel = createTenantModel();
    connection = { models: {} };
    auditModel = { create: jest.fn().mockResolvedValue({}) };
    service = new TenantsService(
      tenantModel as never,
      connection as never,
      auditModel as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('findAll', () => {
    it('lista las empresas de la más reciente a la más antigua', async () => {
      const tenants = [{ name: 'B' }, { name: 'A' }];
      const query = buildQuery(tenants);
      tenantModel.find.mockReturnValue(query);

      const result = await service.findAll();

      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(result).toBe(tenants);
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    function captureCreated() {
      const captured: { data?: any } = {};
      tenantModel.mockImplementation((data: any) => {
        captured.data = data;
        return { ...data, save: jest.fn().mockResolvedValue(data) };
      });
      return captured;
    }

    it('guarda la empresa con el slug derivado del nombre', async () => {
      const captured = captureCreated();

      await service.create({
        name: '  Café Ñandú & Cía.  ',
        email: 'hola@cafe.pe',
        ruc: '20123456789',
        phone: '999888777',
      });

      expect(captured.data).toMatchObject({
        name: '  Café Ñandú & Cía.  ',
        email: 'hola@cafe.pe',
        ruc: '20123456789',
        phone: '999888777',
        slug: 'cafe-nandu-cia',
      });
    });

    it('arranca con 14 días de prueba', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 0, 10, 12, 0, 0));
      const captured = captureCreated();

      await service.create({ name: 'Maya', email: 'hola@maya.pe' });

      expect(captured.data.trialEndsAt).toEqual(
        new Date(2026, 0, 24, 12, 0, 0),
      );
    });

    it('busca duplicados por email o por slug', async () => {
      captureCreated();

      await service.create({ name: 'Bar La Esquina', email: 'bar@esquina.pe' });

      expect(tenantModel.findOne).toHaveBeenCalledWith({
        $or: [{ email: 'bar@esquina.pe' }, { slug: 'bar-la-esquina' }],
      });
    });

    it('email o nombre ya registrados lanzan ConflictException sin crear nada', async () => {
      tenantModel.findOne.mockResolvedValue({ _id: tenantOid });

      await expect(
        service.create({ name: 'Bar La Esquina', email: 'bar@esquina.pe' }),
      ).rejects.toThrow(ConflictException);
      expect(tenantModel).not.toHaveBeenCalled();
    });
  });

  // ─── findById / update ─────────────────────────────────────────────────────

  describe('findById', () => {
    it('devuelve la empresa cuando existe', async () => {
      const tenant = { _id: tenantOid, name: 'Maya' };
      tenantModel.findById.mockReturnValue(buildQuery(tenant));

      await expect(service.findById(tenantId)).resolves.toBe(tenant);
      expect(tenantModel.findById).toHaveBeenCalledWith(tenantId);
    });

    it('id inexistente lanza NotFoundException', async () => {
      await expect(service.findById(tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const doc = (data: Record<string, unknown>) => ({
      _id: tenantOid,
      ...data,
      get: (k: string) => data[k],
    });
    const actor = {
      userId: new Types.ObjectId().toString(),
      email: 'root@maya.pe',
    };

    it('aplica los cambios a esa empresa y devuelve el documento nuevo', async () => {
      tenantModel.findById.mockReturnValue(
        buildQuery(doc({ name: 'Viejo', isActive: true })),
      );
      const updated = { _id: tenantOid, name: 'Nuevo nombre' };
      tenantModel.findByIdAndUpdate.mockReturnValue(buildQuery(updated));

      const result = await service.update(tenantId, { name: 'Nuevo nombre' });

      expect(tenantModel.findByIdAndUpdate).toHaveBeenCalledWith(
        tenantId,
        { $set: { name: 'Nuevo nombre' } },
        { new: true, runValidators: true },
      );
      expect(result).toBe(updated);
      expect(auditModel.create).not.toHaveBeenCalled();
    });

    it('id inexistente lanza NotFoundException', async () => {
      await expect(service.update(tenantId, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('HU16 C3: un correo que ya usa otra empresa da 409 sin guardar', async () => {
      tenantModel.findById.mockReturnValue(
        buildQuery(doc({ email: 'a@a.pe' })),
      );
      tenantModel.exists = jest.fn().mockReturnValue(buildQuery({ _id: 'x' }));
      await expect(
        service.update(tenantId, { email: 'b@b.pe' }, actor),
      ).rejects.toThrow(ConflictException);
      expect(tenantModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('HU16 C6: registra los cambios y la suspensión; quita fechas con null', async () => {
      tenantModel.findById.mockReturnValue(
        buildQuery(
          doc({
            plan: 'starter',
            isActive: true,
            trialEndsAt: new Date('2026-10-20'),
          }),
        ),
      );
      tenantModel.findByIdAndUpdate.mockReturnValue(
        buildQuery({ _id: tenantOid, name: 'La Mar' }),
      );
      await service.update(
        tenantId,
        { plan: 'pro', trialEndsAt: null, isActive: false },
        actor,
      );

      const [, update] = tenantModel.findByIdAndUpdate.mock.calls[0];
      expect(update).toEqual({
        $set: { plan: 'pro', isActive: false },
        $unset: { trialEndsAt: 1 },
      });
      const actions = auditModel.create.mock.calls.map(([d]) => d.action);
      expect(actions).toEqual(['update', 'suspend']);
      expect(auditModel.create.mock.calls[0][0].changes).toEqual({
        plan: { from: 'starter', to: 'pro' },
        trialEndsAt: { from: '2026-10-20', to: undefined },
      });
    });

    it('HU16 C4: isActive se cachea y update lo invalida', async () => {
      const lean = (v: unknown) => ({
        select: () => ({ lean: () => ({ exec: () => Promise.resolve(v) }) }),
      });
      tenantModel.findById.mockReturnValueOnce(lean({ isActive: true }));
      await expect(service.isActive(tenantId)).resolves.toBe(true);
      await expect(service.isActive(tenantId)).resolves.toBe(true);
      expect(tenantModel.findById).toHaveBeenCalledTimes(1);

      tenantModel.findById.mockReturnValueOnce(
        buildQuery(doc({ isActive: true })),
      );
      tenantModel.findByIdAndUpdate.mockReturnValue(
        buildQuery({ _id: tenantOid, isActive: false }),
      );
      await service.update(tenantId, { isActive: false });
      tenantModel.findById.mockReturnValueOnce(lean({ isActive: false }));
      await expect(service.isActive(tenantId)).resolves.toBe(false);
      await expect(service.isActive(undefined)).resolves.toBe(true);
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('un id mal formado lanza NotFoundException sin consultar', async () => {
      await expect(service.remove('no-es-un-id')).rejects.toThrow(
        NotFoundException,
      );
      expect(tenantModel.findById).not.toHaveBeenCalled();
    });

    it('si la empresa no existe no borra datos de nadie', async () => {
      const users = registeredModel('ObjectId');
      connection.models = { User: users };

      await expect(service.remove(tenantId)).rejects.toThrow(NotFoundException);
      expect(users.deleteMany).not.toHaveBeenCalled();
      expect(tenantModel.deleteOne).not.toHaveBeenCalled();
    });

    it('borra solo los documentos de esa empresa en cada modelo con tenantId', async () => {
      tenantModel.findById.mockReturnValue(buildQuery({ _id: tenantOid }));
      const users = registeredModel('ObjectId');
      const customers = registeredModel('ObjectId');
      connection.models = {
        User: users,
        Customer: customers,
        Tenant: tenantModel,
      };

      const result = await service.remove(tenantId);

      for (const model of [users, customers]) {
        expect(model.deleteMany).toHaveBeenCalledTimes(1);
        const filter = model.deleteMany.mock.calls[0][0];
        expect(Object.keys(filter)).toEqual(['tenantId']);
        expect(Object.keys(filter.tenantId)).toEqual(['$in']);
        expect(filter.tenantId.$in.map(String)).toEqual([tenantId, tenantId]);
      }
      expect(result).toEqual({ deleted: true });
    });

    it('filtra por el id como ObjectId y como texto, sea cual sea el tipo de la ruta', async () => {
      tenantModel.findById.mockReturnValue(buildQuery({ _id: tenantOid }));
      // `@Prop({ type: Types.ObjectId })` deja la ruta como Mixed y Mongoose
      // no convierte el valor: hacen falta las dos formas a la vez.
      const mixed = registeredModel('Mixed');
      const logs = registeredModel('String');
      connection.models = { Customer: mixed, Log: logs };

      await service.remove(tenantId);

      for (const model of [mixed, logs]) {
        const { $in } = model.deleteMany.mock.calls[0][0].tenantId;
        expect($in).toHaveLength(2);
        expect($in[0]).toBeInstanceOf(Types.ObjectId);
        expect($in[0].toString()).toBe(tenantId);
        expect($in[1]).toBe(tenantId);
      }
    });

    it('no toca los modelos globales, sin campo tenantId', async () => {
      tenantModel.findById.mockReturnValue(buildQuery({ _id: tenantOid }));
      const plans = registeredModel();
      connection.models = { Plan: plans };

      await service.remove(tenantId);

      expect(plans.deleteMany).not.toHaveBeenCalled();
    });

    it('elimina la empresa al final, después de sus datos', async () => {
      tenantModel.findById.mockReturnValue(buildQuery({ _id: tenantOid }));
      const users = registeredModel('ObjectId');
      connection.models = { User: users };

      await service.remove(tenantId);

      const filter = tenantModel.deleteOne.mock.calls[0][0];
      expect(filter._id.toString()).toBe(tenantId);
      expect(users.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        tenantModel.deleteOne.mock.invocationCallOrder[0],
      );
    });
  });

  describe('remove con confirmación (HU16 C5)', () => {
    const actor = { userId: new Types.ObjectId().toString() };
    it('sin el nombre exacto da 400 y no borra nada', async () => {
      tenantModel.findById.mockReturnValue(
        buildQuery({ _id: tenantOid, name: 'La Mar' }),
      );
      const users = registeredModel('ObjectId');
      connection.models = { User: users };
      await expect(
        service.remove(tenantId, { confirmName: 'la mar', actor }),
      ).rejects.toThrow(BadRequestException);
      expect(users.deleteMany).not.toHaveBeenCalled();
    });

    it('con el nombre borra y registra la eliminación', async () => {
      tenantModel.findById.mockReturnValue(
        buildQuery({ _id: tenantOid, name: 'La Mar' }),
      );
      await service.remove(tenantId, { confirmName: 'La Mar', actor });
      expect(tenantModel.deleteOne).toHaveBeenCalled();
      expect(auditModel.create.mock.calls[0][0].action).toBe('delete');
    });
  });
});
