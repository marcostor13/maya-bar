import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CustomersService } from './customers.service';
import { Customer } from './customer.schema';
import { ContactActivity } from './contact-activity.schema';
import { ContactForm } from '../forms/form.schema';
import { Reservation } from '../reservations/reservation.schema';
import { EventRegistration } from '../events/event-registration.schema';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const tenantId = tenantOid.toString();
const userOid = new Types.ObjectId();
const userId = userOid.toString();

function buildQuery(result: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'lean', 'populate']) q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(result);
  return q;
}

function makeCustomerDoc(overrides: Record<string, unknown> = {}) {
  const doc: any = {
    _id: new Types.ObjectId(),
    tenantId: tenantOid,
    name: 'Ana Pérez',
    email: 'ana@correo.pe',
    phone: '+51 999 888 777',
    tags: [] as string[],
    source: 'manual',
    createdBy: undefined as Types.ObjectId | undefined,
    totalReservations: 0,
    totalEvents: 0,
    save: jest.fn(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  return doc;
}

function createMockModel() {
  const model: any = jest.fn();
  model.find = jest.fn().mockImplementation(() => buildQuery([]));
  model.findById = jest.fn().mockReturnValue(buildQuery(null));
  model.findByIdAndDelete = jest.fn().mockReturnValue(buildQuery(null));
  model.deleteMany = jest.fn().mockReturnValue(buildQuery({}));
  model.countDocuments = jest.fn().mockResolvedValue(0);
  model.updateOne = jest.fn().mockResolvedValue({});
  model.updateMany = jest
    .fn()
    .mockReturnValue(buildQuery({ modifiedCount: 0 }));
  model.bulkWrite = jest
    .fn()
    .mockResolvedValue({ upsertedCount: 0, modifiedCount: 0 });
  model.syncIndexes = jest.fn().mockResolvedValue(undefined);
  model.collection = {
    indexes: jest.fn().mockResolvedValue([]),
    dropIndex: jest.fn().mockResolvedValue(undefined),
  };
  return model;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('CustomersService', () => {
  let service: CustomersService;
  let customerModel: any;
  let reservationModel: any;
  let eventRegModel: any;
  let formModel: any;
  let activityModel: any;

  beforeEach(async () => {
    customerModel = createMockModel();
    reservationModel = createMockModel();
    eventRegModel = createMockModel();
    formModel = createMockModel();
    activityModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: getModelToken(Customer.name), useValue: customerModel },
        {
          provide: getModelToken(Reservation.name),
          useValue: reservationModel,
        },
        {
          provide: getModelToken(EventRegistration.name),
          useValue: eventRegModel,
        },
        { provide: getModelToken(ContactForm.name), useValue: formModel },
        {
          provide: getModelToken(ContactActivity.name),
          useValue: activityModel,
        },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function stubFindById(doc: unknown) {
    customerModel.findById.mockReturnValue(buildQuery(doc));
  }

  // ─── findForms ──────────────────────────────────────────────────────────────

  describe('findForms', () => {
    it('lista los formularios de la empresa en versión mínima', async () => {
      const formId = new Types.ObjectId();
      const query = buildQuery([
        { _id: formId, name: 'Landing', fields: ['a'] },
      ]);
      formModel.find.mockReturnValue(query);

      const result = await service.findForms(tenantId, userId, 'MANAGER');

      const [filter, projection] = formModel.find.mock.calls[0];
      expect(Object.keys(filter)).toEqual(['tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(projection).toEqual({ name: 1 });
      expect(query.sort).toHaveBeenCalledWith({ name: 1 });
      expect(result).toEqual([{ _id: formId.toString(), name: 'Landing' }]);
    });

    it('el impulsador solo ve los formularios que creó', async () => {
      await service.findForms(tenantId, userId, 'IMPULSADOR');

      const filter = formModel.find.mock.calls[0][0];
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.createdBy.toString()).toBe(userId);
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('filtra solo por empresa y ordena por nombre para roles de gestión', async () => {
      const query = buildQuery([]);
      customerModel.find.mockReturnValue(query);

      await service.findAll(tenantId, userId, 'TENANT_ADMIN');

      const filter = customerModel.find.mock.calls[0][0];
      expect(Object.keys(filter)).toEqual(['tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(query.sort).toHaveBeenCalledWith({ name: 1 });
      expect(query.populate).toHaveBeenCalledWith('ownerId', 'name email');
    });

    it('el impulsador solo ve los contactos que creó', async () => {
      await service.findAll(tenantId, userId, 'IMPULSADOR');

      const filter = customerModel.find.mock.calls[0][0];
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.createdBy.toString()).toBe(userId);
    });

    it('marketing ve todos los contactos de la empresa', async () => {
      await service.findAll(tenantId, userId, 'MARKETING');

      expect(customerModel.find.mock.calls[0][0]).not.toHaveProperty(
        'createdBy',
      );
    });

    it('filtra por etiqueta y por formulario dentro del array formIds', async () => {
      const formId = new Types.ObjectId().toString();

      await service.findAll(
        tenantId,
        userId,
        'MANAGER',
        undefined,
        'vip',
        formId,
      );

      const filter = customerModel.find.mock.calls[0][0];
      expect(filter.tags).toBe('vip');
      expect(filter.formIds.toString()).toBe(formId);
      expect(filter).not.toHaveProperty('formId');
    });

    it('ignora un formId que no es un ObjectId válido', async () => {
      await service.findAll(
        tenantId,
        userId,
        'MANAGER',
        undefined,
        undefined,
        'no-es-un-id',
      );

      expect(customerModel.find.mock.calls[0][0]).not.toHaveProperty('formIds');
    });

    it('la búsqueda mira nombre, email y teléfono sin distinguir mayúsculas', async () => {
      await service.findAll(tenantId, userId, 'MANAGER', 'ana');

      const { $or } = customerModel.find.mock.calls[0][0] as {
        $or: Record<string, RegExp>[];
      };
      expect($or.map((c) => Object.keys(c)[0])).toEqual([
        'name',
        'email',
        'phone',
      ]);
      expect($or[0].name.flags).toBe('i');
      expect($or[0].name.test('ANA PÉREZ')).toBe(true);
    });

    it('escapa los caracteres de expresión regular de la búsqueda', async () => {
      await service.findAll(tenantId, userId, 'MANAGER', 'a.b+(c)');

      const { $or } = customerModel.find.mock.calls[0][0] as {
        $or: Record<string, RegExp>[];
      };
      expect($or[1].email.test('a.b+(c)@correo.pe')).toBe(true);
      expect($or[1].email.test('aXbb(c)@correo.pe')).toBe(false);
    });

    it('la búsqueda no saca al impulsador de su alcance', async () => {
      await service.findAll(tenantId, userId, 'IMPULSADOR', 'ana');

      const filter = customerModel.find.mock.calls[0][0];
      expect(filter.createdBy.toString()).toBe(userId);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.$or).toHaveLength(3);
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    function captureCreated() {
      const captured: { data?: any } = {};
      customerModel.mockImplementation((data: any) => {
        captured.data = data;
        return makeCustomerDoc(data);
      });
      return captured;
    }

    it('guarda el contacto en la empresa con email y teléfono normalizados', async () => {
      const captured = captureCreated();

      await service.create(tenantId, userId, 'MANAGER', {
        name: 'Ana',
        email: '  Ana@Correo.PE ',
        phone: '999888777',
        notes: 'Cliente frecuente',
      });

      expect(captured.data.tenantId.toString()).toBe(tenantId);
      expect(captured.data).toMatchObject({
        name: 'Ana',
        email: 'ana@correo.pe',
        phone: '+51 999 888 777',
        notes: 'Cliente frecuente',
        tags: [],
        source: 'manual',
      });
      expect(captured.data).not.toHaveProperty('createdBy');
    });

    it('admite un contacto solo con teléfono, sin email', async () => {
      const captured = captureCreated();

      await service.create(tenantId, userId, 'MANAGER', {
        name: 'Luis',
        phone: '+34 600 111 222',
      });

      expect(captured.data.email).toBeUndefined();
      expect(captured.data.phone).toBe('+34 600 111 222');
    });

    it('conserva las etiquetas enviadas', async () => {
      const captured = captureCreated();

      await service.create(tenantId, userId, 'MANAGER', {
        name: 'Ana',
        tags: ['vip', 'evento'],
      });

      expect(captured.data.tags).toEqual(['vip', 'evento']);
    });

    it('el origen y la empresa no se pueden imponer desde el cuerpo', async () => {
      const captured = captureCreated();
      const ajeno = new Types.ObjectId().toString();

      await service.create(tenantId, userId, 'MANAGER', {
        name: 'Ana',
        source: 'import',
        tenantId: ajeno,
      } as never);

      expect(captured.data.source).toBe('manual');
      expect(captured.data.tenantId.toString()).toBe(tenantId);
    });

    it('marca como propio el contacto creado por un impulsador', async () => {
      const captured = captureCreated();

      await service.create(tenantId, userId, 'IMPULSADOR', { name: 'Ana' });

      expect(captured.data.createdBy.toString()).toBe(userId);
    });

    it('duplicado (11000) se traduce a ConflictException', async () => {
      const doc = makeCustomerDoc();
      doc.save.mockRejectedValue({ code: 11000 });
      customerModel.mockImplementation(() => doc);

      await expect(
        service.create(tenantId, userId, 'MANAGER', {
          name: 'Ana',
          email: 'ana@correo.pe',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('cualquier otro error de guardado se propaga tal cual', async () => {
      const boom = new Error('validación');
      const doc = makeCustomerDoc();
      doc.save.mockRejectedValue(boom);
      customerModel.mockImplementation(() => doc);

      await expect(
        service.create(tenantId, userId, 'MANAGER', { name: 'Ana' }),
      ).rejects.toBe(boom);
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('aplica los cambios normalizando email y teléfono', async () => {
      const doc = makeCustomerDoc();
      stubFindById(doc);

      await service.update(doc._id.toString(), tenantId, userId, 'MANAGER', {
        name: 'Ana María',
        email: ' NUEVA@Correo.pe ',
        phone: '987654321',
      });

      expect(doc.name).toBe('Ana María');
      expect(doc.email).toBe('nueva@correo.pe');
      expect(doc.phone).toBe('+51 987 654 321');
      expect(doc.save).toHaveBeenCalledTimes(1);
    });

    it('no mandar teléfono deja el que hubiera', async () => {
      const doc = makeCustomerDoc();
      stubFindById(doc);

      await service.update(doc._id.toString(), tenantId, userId, 'MANAGER', {
        name: 'Ana María',
      });

      expect(doc.phone).toBe('+51 999 888 777');
      expect(doc.email).toBe('ana@correo.pe');
    });

    it('teléfono vacío es un borrado explícito', async () => {
      const doc = makeCustomerDoc();
      stubFindById(doc);

      await service.update(doc._id.toString(), tenantId, userId, 'MANAGER', {
        phone: '',
      });

      expect(doc.phone).toBeUndefined();
    });

    it('id inexistente lanza NotFoundException', async () => {
      stubFindById(null);

      await expect(
        service.update('x', tenantId, userId, 'MANAGER', { name: 'N' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('un contacto de otra empresa no se modifica', async () => {
      const doc = makeCustomerDoc({ tenantId: new Types.ObjectId() });
      stubFindById(doc);

      await expect(
        service.update(doc._id.toString(), tenantId, userId, 'MANAGER', {
          name: 'Hackeado',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(doc.name).toBe('Ana Pérez');
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('el impulsador no modifica contactos que no creó', async () => {
      const ajeno = makeCustomerDoc({ createdBy: new Types.ObjectId() });
      stubFindById(ajeno);
      await expect(
        service.update('x', tenantId, userId, 'IMPULSADOR', { name: 'N' }),
      ).rejects.toThrow(ForbiddenException);

      // Tampoco los de la empresa (sin creador), que son de gestión.
      const sinCreador = makeCustomerDoc();
      stubFindById(sinCreador);
      await expect(
        service.update('x', tenantId, userId, 'IMPULSADOR', { name: 'N' }),
      ).rejects.toThrow(ForbiddenException);

      expect(ajeno.save).not.toHaveBeenCalled();
      expect(sinCreador.save).not.toHaveBeenCalled();
    });

    it('el impulsador sí modifica los suyos', async () => {
      const doc = makeCustomerDoc({ createdBy: userOid });
      stubFindById(doc);

      await service.update('x', tenantId, userId, 'IMPULSADOR', {
        name: 'Mío',
      });

      expect(doc.name).toBe('Mío');
      expect(doc.save).toHaveBeenCalled();
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('borra el contacto y su bitácora', async () => {
      const doc = makeCustomerDoc();
      stubFindById(doc);
      const id = doc._id.toString();

      await service.delete(id, tenantId, userId, 'MANAGER');

      expect(customerModel.findByIdAndDelete).toHaveBeenCalledWith(id);
      expect(activityModel.deleteMany).toHaveBeenCalledWith({
        customerId: doc._id,
      });
    });

    it('id inexistente lanza NotFoundException y no borra nada', async () => {
      stubFindById(null);

      await expect(
        service.delete('x', tenantId, userId, 'MANAGER'),
      ).rejects.toThrow(NotFoundException);
      expect(customerModel.findByIdAndDelete).not.toHaveBeenCalled();
      expect(activityModel.deleteMany).not.toHaveBeenCalled();
    });

    it('un contacto de otra empresa no se borra', async () => {
      stubFindById(makeCustomerDoc({ tenantId: new Types.ObjectId() }));

      await expect(
        service.delete('x', tenantId, userId, 'TENANT_ADMIN'),
      ).rejects.toThrow(ForbiddenException);
      expect(customerModel.findByIdAndDelete).not.toHaveBeenCalled();
      expect(activityModel.deleteMany).not.toHaveBeenCalled();
    });

    it('el impulsador no borra contactos que no creó', async () => {
      stubFindById(makeCustomerDoc({ createdBy: new Types.ObjectId() }));

      await expect(
        service.delete('x', tenantId, userId, 'IMPULSADOR'),
      ).rejects.toThrow(ForbiddenException);
      expect(customerModel.findByIdAndDelete).not.toHaveBeenCalled();
    });
  });

  // ─── sync ───────────────────────────────────────────────────────────────────

  describe('sync', () => {
    function stubSources(reservations: unknown[], eventRegs: unknown[]) {
      reservationModel.find.mockReturnValue(buildQuery(reservations));
      eventRegModel.find.mockReturnValue(buildQuery(eventRegs));
    }

    it('sin reservas ni registros no escribe nada', async () => {
      stubSources([], []);

      await expect(service.sync(tenantId)).resolves.toEqual({
        imported: 0,
        updated: 0,
      });
      expect(customerModel.bulkWrite).not.toHaveBeenCalled();
    });

    it('lee reservas y registros solo de la empresa', async () => {
      stubSources([], []);

      await service.sync(tenantId);

      for (const model of [reservationModel, eventRegModel]) {
        const filter = model.find.mock.calls[0][0];
        expect(Object.keys(filter)).toEqual(['tenantId']);
        expect(filter.tenantId.toString()).toBe(tenantId);
      }
    });

    it('hace upsert por email dentro de la empresa sin tocar contactos de impulsadores', async () => {
      stubSources(
        [],
        [{ email: 'Ana@Correo.pe', name: 'Ana', phone: '999888777' }],
      );
      customerModel.bulkWrite.mockResolvedValue({
        upsertedCount: 1,
        modifiedCount: 0,
      });

      const result = await service.sync(tenantId);

      const ops = customerModel.bulkWrite.mock.calls[0][0];
      expect(ops).toHaveLength(1);
      const { filter, update, upsert } = ops[0].updateOne;
      expect(filter.email).toBe('ana@correo.pe');
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.createdBy).toEqual({ $exists: false });
      expect(update.$setOnInsert).toEqual({ source: 'event', tags: [] });
      expect(update.$set).toEqual({ name: 'Ana', phone: '+51 999 888 777' });
      expect(upsert).toBe(true);
      expect(result).toEqual({ imported: 1, updated: 0 });
    });

    it('si el mismo email reservó y fue a un evento, se queda con la reserva y su fecha', async () => {
      stubSources(
        [
          {
            guestEmail: 'ANA@correo.pe',
            guestName: 'Ana Reserva',
            guestPhone: undefined,
            date: '2026-03-05',
          },
        ],
        [{ email: 'ana@correo.pe', name: 'Ana Evento', phone: '999888777' }],
      );

      await service.sync(tenantId);

      const ops = customerModel.bulkWrite.mock.calls[0][0];
      expect(ops).toHaveLength(1);
      const { update } = ops[0].updateOne;
      expect(update.$setOnInsert.source).toBe('reservation');
      expect(update.$set).toEqual({
        name: 'Ana Reserva',
        lastVisit: new Date('2026-03-05'),
      });
    });

    it('recalcula reservas y eventos de cada contacto dentro de la empresa', async () => {
      stubSources(
        [{ guestEmail: 'ana@correo.pe', guestName: 'Ana' }],
        [{ email: 'luis@correo.pe', name: 'Luis' }],
      );
      reservationModel.countDocuments.mockResolvedValue(3);
      eventRegModel.countDocuments.mockResolvedValue(2);
      customerModel.bulkWrite.mockResolvedValue({
        upsertedCount: 1,
        modifiedCount: 1,
      });

      const result = await service.sync(tenantId);

      expect(result).toEqual({ imported: 1, updated: 1 });
      expect(customerModel.updateOne).toHaveBeenCalledTimes(2);
      for (const [filter, change] of customerModel.updateOne.mock.calls) {
        expect(filter.tenantId.toString()).toBe(tenantId);
        expect(filter.createdBy).toEqual({ $exists: false });
        expect(change).toEqual({
          $set: { totalReservations: 3, totalEvents: 2 },
        });
      }
      for (const model of [reservationModel, eventRegModel])
        for (const [filter] of model.countDocuments.mock.calls)
          expect(filter.tenantId.toString()).toBe(tenantId);
    });
  });

  // ─── exportCsv ──────────────────────────────────────────────────────────────

  describe('exportCsv', () => {
    it('exporta una fila por contacto escapando comillas', async () => {
      customerModel.find.mockReturnValue(
        buildQuery([
          makeCustomerDoc({
            name: 'Ana "La Jefa" Pérez',
            tags: ['vip', 'evento'],
            source: 'form',
            lastVisit: new Date('2026-03-05T12:00:00Z'),
            totalReservations: 4,
            totalEvents: 1,
          }),
          makeCustomerDoc({
            name: 'Luis',
            email: undefined,
            phone: undefined,
          }),
        ]),
      );

      const csv = await service.exportCsv(tenantId, userId, 'MANAGER');

      expect(csv.split('\n')).toEqual([
        'Nombre,Email,Teléfono,Tags,Origen,Última visita,Reservas,Eventos',
        '"Ana ""La Jefa"" Pérez","ana@correo.pe","+51 999 888 777","vip;evento","form","2026-03-05","4","1"',
        '"Luis","","","","manual","","0","0"',
      ]);
    });

    it('sin contactos devuelve solo la cabecera', async () => {
      const csv = await service.exportCsv(tenantId, userId, 'MANAGER');

      expect(csv).toBe(
        'Nombre,Email,Teléfono,Tags,Origen,Última visita,Reservas,Eventos\n',
      );
    });

    it('el impulsador solo exporta sus contactos', async () => {
      await service.exportCsv(tenantId, userId, 'IMPULSADOR');

      const filter = customerModel.find.mock.calls[0][0];
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.createdBy.toString()).toBe(userId);
    });
  });

  // ─── onModuleInit ──────────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    const emailKey = { email: 1, tenantId: 1, createdBy: 1 };

    let warn: jest.SpyInstance;

    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
    });

    it('suelta el índice único de email antiguo y sincroniza', async () => {
      customerModel.collection.indexes.mockResolvedValue([
        { name: '_id_', key: { _id: 1 } },
        { name: 'email_viejo', key: emailKey },
      ]);

      await service.onModuleInit();

      expect(customerModel.collection.dropIndex).toHaveBeenCalledTimes(1);
      expect(customerModel.collection.dropIndex).toHaveBeenCalledWith(
        'email_viejo',
      );
      expect(customerModel.syncIndexes).toHaveBeenCalled();
    });

    it('no toca el índice de email que ya es parcial', async () => {
      customerModel.collection.indexes.mockResolvedValue([
        {
          name: 'email_parcial',
          key: emailKey,
          partialFilterExpression: { email: { $type: 'string' } },
        },
      ]);

      await service.onModuleInit();

      expect(customerModel.collection.dropIndex).not.toHaveBeenCalled();
    });

    it('vuelca el formulario de alta a formIds solo donde falta', async () => {
      await service.onModuleInit();

      const [filter, pipeline] = customerModel.updateMany.mock.calls[0];
      expect(filter).toEqual({
        formId: { $ne: null },
        formIds: { $in: [null, []] },
      });
      expect(pipeline).toEqual([{ $set: { formIds: ['$formId'] } }]);
    });

    it('un fallo al sincronizar índices no tumba el arranque', async () => {
      customerModel.syncIndexes.mockRejectedValue(new Error('E11000 phone'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('E11000 phone'),
      );
    });
  });
});
