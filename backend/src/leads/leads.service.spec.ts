import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LeadsService } from './leads.service';
import { Lead } from './lead.schema';
import { LeadActivity } from './lead-activity.schema';
import { Customer } from '../customers/customer.schema';
import { User } from '../users/user.schema';

const tenantId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();
const leadOid = new Types.ObjectId();
const customerOid = new Types.ObjectId();

/** Query encadenable: find().populate().sort().limit().select().exec() */
function buildQuery(result: unknown) {
  const q: any = { exec: jest.fn().mockResolvedValue(result) };
  for (const m of ['populate', 'sort', 'limit', 'select', 'skip'])
    q[m] = jest.fn().mockReturnValue(q);
  return q;
}

function createMockModel() {
  const model: any = jest.fn();
  model.find = jest.fn().mockReturnValue(buildQuery([]));
  model.findOne = jest.fn().mockReturnValue(buildQuery(null));
  model.countDocuments = jest.fn().mockReturnValue(buildQuery(0));
  model.create = jest.fn();
  model.updateOne = jest.fn().mockReturnValue(buildQuery(null));
  model.deleteOne = jest.fn().mockReturnValue(buildQuery(null));
  model.deleteMany = jest.fn().mockReturnValue(buildQuery(null));
  return model;
}

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    _id: leadOid,
    tenantId: new Types.ObjectId(tenantId),
    customerId: customerOid,
    title: 'Evento corporativo',
    stage: 'new',
    status: 'open',
    value: 1000,
    position: 0,
    tags: [],
    ownerId: new Types.ObjectId(userId),
    createdBy: new Types.ObjectId(userId),
    lastActivityAt: new Date(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

describe('LeadsService', () => {
  let service: LeadsService;
  let leadModel: any;
  let activityModel: any;
  let customerModel: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    leadModel = createMockModel();
    activityModel = createMockModel();
    customerModel = createMockModel();
    activityModel.create.mockResolvedValue({ _id: new Types.ObjectId() });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: getModelToken(Lead.name), useValue: leadModel },
        { provide: getModelToken(LeadActivity.name), useValue: activityModel },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getModelToken(User.name), useValue: createMockModel() },
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
  });

  describe('board', () => {
    it('groups leads into one column per stage with counts and totals', async () => {
      leadModel.find.mockReturnValue(
        buildQuery([
          makeLead({ stage: 'new', value: 100 }),
          makeLead({ stage: 'new', value: 250 }),
          makeLead({ stage: 'won', value: 900, status: 'won' }),
        ]),
      );

      const board = await service.board(tenantId, userId, 'TENANT_ADMIN');

      expect(board).toHaveLength(7);
      const nuevo = board.find((c) => c.stage === 'new')!;
      expect(nuevo.count).toBe(2);
      expect(nuevo.value).toBe(350);
      const won = board.find((c) => c.stage === 'won')!;
      expect(won.count).toBe(1);
      expect(won.value).toBe(900);
      expect(board.find((c) => c.stage === 'lost')!.count).toBe(0);
    });

    it('scopes owner-restricted roles to their own leads', async () => {
      await service.board(tenantId, userId, 'IMPULSADOR');
      const query = leadModel.find.mock.calls[0][0];
      expect(query.$or).toEqual([
        { ownerId: new Types.ObjectId(userId) },
        { createdBy: new Types.ObjectId(userId) },
      ]);
    });

    it('does not scope tenant-wide roles', async () => {
      await service.board(tenantId, userId, 'MANAGER');
      expect(leadModel.find.mock.calls[0][0].$or).toBeUndefined();
    });
  });

  describe('stats', () => {
    it('computes pipeline, weighted value and conversion rate', async () => {
      const open = [
        makeLead({ stage: 'new', value: 1000 }), // 10%
        makeLead({ stage: 'proposal', value: 2000 }), // 65%
      ];
      const wonMonth = [makeLead({ stage: 'won', value: 500, status: 'won' })];
      leadModel.find
        .mockReturnValueOnce(buildQuery(open)) // abiertos
        .mockReturnValueOnce(buildQuery(wonMonth)) // ganados del mes
        .mockReturnValueOnce(buildQuery([])); // tareas
      leadModel.countDocuments
        .mockReturnValueOnce(buildQuery(1)) // perdidos del mes
        .mockReturnValueOnce(buildQuery(3)) // ganados histórico
        .mockReturnValueOnce(buildQuery(1)); // perdidos histórico

      const stats = await service.stats(tenantId, userId, 'TENANT_ADMIN');

      expect(stats.open).toBe(2);
      expect(stats.openValue).toBe(3000);
      expect(stats.weightedValue).toBe(1400); // 1000*0.1 + 2000*0.65
      expect(stats.wonThisMonth).toBe(1);
      expect(stats.wonValueThisMonth).toBe(500);
      expect(stats.conversionRate).toBe(75); // 3 de 4 cerradas
    });
  });

  describe('upsertCustomer', () => {
    it('reuses an existing contact matched by phone', async () => {
      const existing = {
        _id: customerOid,
        name: 'Ana',
        phone: '+51 999 888 777',
        tags: [],
        save: jest.fn(),
      };
      customerModel.findOne.mockReturnValue(buildQuery(existing));

      const result = await service.upsertCustomer(
        tenantId,
        userId,
        'TENANT_ADMIN',
        { name: 'Ana Torres', phone: '999888777' },
      );

      expect(result).toBe(existing);
      expect(customerModel.create).not.toHaveBeenCalled();
    });

    it('fills in a missing email on the existing contact', async () => {
      const existing = {
        _id: customerOid,
        name: 'Ana',
        phone: '+51 999 888 777',
        tags: [],
        save: jest.fn(),
      };
      customerModel.findOne.mockReturnValue(buildQuery(existing));

      await service.upsertCustomer(tenantId, userId, 'TENANT_ADMIN', {
        name: 'Ana',
        phone: '999888777',
        email: 'Ana@Mail.com',
      });

      expect(existing.email).toBe('ana@mail.com');
      expect(existing.save).toHaveBeenCalled();
    });

    it('creates a normalized contact when none matches', async () => {
      customerModel.findOne.mockReturnValue(buildQuery(null));
      customerModel.create.mockResolvedValue({ _id: customerOid });

      await service.upsertCustomer(tenantId, userId, 'TENANT_ADMIN', {
        name: '  Ana Torres ',
        phone: '999888777',
        source: 'whatsapp',
      });

      const doc = customerModel.create.mock.calls[0][0];
      expect(doc.name).toBe('Ana Torres');
      expect(doc.phone).toBe('+51 999 888 777');
      expect(doc.source).toBe('whatsapp');
      // Los roles de tenant no marcan dueño: el contacto es de la empresa.
      expect(doc.createdBy).toBeUndefined();
    });

    it('marks the owner for owner-scoped roles', async () => {
      customerModel.findOne.mockReturnValue(buildQuery(null));
      customerModel.create.mockResolvedValue({ _id: customerOid });

      await service.upsertCustomer(tenantId, userId, 'IMPULSADOR', {
        name: 'Ana',
        phone: '999888777',
      });

      expect(customerModel.create.mock.calls[0][0].createdBy).toEqual(
        new Types.ObjectId(userId),
      );
    });
  });

  describe('move', () => {
    it('closes the lead and logs the stage change when moving to won', async () => {
      const lead = makeLead({ stage: 'proposal' });
      leadModel.find.mockReturnValue(buildQuery([lead]));

      await service.move(String(leadOid), tenantId, userId, 'TENANT_ADMIN', {
        stage: 'won',
      });

      expect(lead.stage).toBe('won');
      expect(lead.status).toBe('won');
      expect(lead.closedAt).toBeInstanceOf(Date);
      expect(activityModel.create).toHaveBeenCalledTimes(1);
      expect(activityModel.create.mock.calls[0][0]).toMatchObject({
        type: 'stage_change',
        title: 'Etapa: Propuesta → Ganado',
      });
    });

    it('keeps the lost reason only while the lead is lost', async () => {
      const lead = makeLead({ stage: 'negotiation', lostReason: undefined });
      leadModel.find.mockReturnValue(buildQuery([lead]));

      await service.move(String(leadOid), tenantId, userId, 'TENANT_ADMIN', {
        stage: 'lost',
        lostReason: 'Precio',
      });
      expect(lead.status).toBe('lost');
      expect(lead.lostReason).toBe('Precio');

      await service.move(String(leadOid), tenantId, userId, 'TENANT_ADMIN', {
        stage: 'qualified',
      });
      expect(lead.status).toBe('open');
      expect(lead.lostReason).toBeUndefined();
      expect(lead.closedAt).toBeUndefined();
    });

    it('rejects a lead that belongs to somebody else for owner-scoped roles', async () => {
      const other = new Types.ObjectId();
      leadModel.find.mockReturnValue(
        buildQuery([makeLead({ ownerId: other, createdBy: other })]),
      );

      await expect(
        service.move(String(leadOid), tenantId, userId, 'IMPULSADOR', {
          stage: 'won',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws when the lead does not exist', async () => {
      leadModel.find.mockReturnValue(buildQuery([]));
      await expect(
        service.move(String(leadOid), tenantId, userId, 'TENANT_ADMIN', {
          stage: 'won',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addActivity', () => {
    it('stores the activity and refreshes the next action from pending tasks', async () => {
      const lead = makeLead();
      leadModel.find.mockReturnValue(buildQuery([lead]));
      const dueAt = new Date('2026-10-01T15:00:00.000Z');
      activityModel.findOne.mockReturnValue(
        buildQuery({ dueAt, title: 'Llamar a Ana' }),
      );

      await service.addActivity(
        String(leadOid),
        tenantId,
        userId,
        'TENANT_ADMIN',
        {
          type: 'task',
          title: 'Llamar a Ana',
          dueAt: dueAt.toISOString(),
        },
      );

      expect(activityModel.create.mock.calls[0][0]).toMatchObject({
        type: 'task',
        title: 'Llamar a Ana',
        done: false,
      });
      expect(leadModel.updateOne.mock.calls[0][1]).toEqual({
        $set: { nextActionAt: dueAt, nextActionTitle: 'Llamar a Ana' },
      });
    });

    it('refuses activity types the platform logs on its own', async () => {
      leadModel.find.mockReturnValue(buildQuery([makeLead()]));
      await expect(
        service.addActivity(String(leadOid), tenantId, userId, 'TENANT_ADMIN', {
          type: 'stage_change',
          title: 'a mano',
        }),
      ).rejects.toThrow('automáticamente');
    });

    it('clears the next action when the last task is completed', async () => {
      leadModel.find.mockReturnValue(buildQuery([makeLead()]));
      const activity = {
        _id: new Types.ObjectId(),
        done: false,
        save: jest.fn(),
      };
      activityModel.findOne
        .mockReturnValueOnce(buildQuery(activity))
        .mockReturnValueOnce(buildQuery(null));

      await service.updateActivity(
        String(leadOid),
        String(activity._id),
        tenantId,
        userId,
        'TENANT_ADMIN',
        { done: true },
      );

      expect(activity.done).toBe(true);
      expect(leadModel.updateOne.mock.calls[0][1]).toEqual({
        $set: { nextActionAt: null, nextActionTitle: null },
      });
    });
  });
});
