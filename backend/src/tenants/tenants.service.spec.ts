import { ConflictException, NotFoundException } from '@nestjs/common';
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

  beforeEach(() => {
    tenantModel = createTenantModel();
    connection = { models: {} };
    service = new TenantsService(tenantModel as never, connection as never);
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
    it('aplica los cambios a esa empresa y devuelve el documento nuevo', async () => {
      const updated = { _id: tenantOid, name: 'Nuevo nombre' };
      tenantModel.findByIdAndUpdate.mockReturnValue(buildQuery(updated));

      const result = await service.update(tenantId, { name: 'Nuevo nombre' });

      expect(tenantModel.findByIdAndUpdate).toHaveBeenCalledWith(
        tenantId,
        { name: 'Nuevo nombre' },
        { new: true },
      );
      expect(result).toBe(updated);
    });

    it('id inexistente lanza NotFoundException', async () => {
      await expect(service.update(tenantId, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
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
});
