import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { LeadsService } from './leads.service';
import { Lead } from './lead.schema';
import { LeadActivity } from './lead-activity.schema';
import { Customer } from '../customers/customer.schema';
import { User } from '../users/user.schema';
import { ConversionsService } from '../conversions/conversions.service';
import { RolesService } from '../roles/roles.service';
import { PushService } from '../push/push.service';
import { NativePushService } from '../notifications/push.service';
import { LeadStagesService } from './lead-stages.service';
import { LeadStageEntry } from './lead-stage.schema';
import { LEAD_STAGES } from './lead-stages.catalog';

const tenantId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();
const leadOid = new Types.ObjectId();
const customerOid = new Types.ObjectId();

/** Query encadenable: find().populate().sort().limit().select().exec() */
function buildQuery(result: unknown) {
  const q: any = { exec: jest.fn().mockResolvedValue(result) };
  for (const m of ['populate', 'sort', 'limit', 'select', 'skip', 'lean'])
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
  model.findById = jest.fn().mockReturnValue(buildQuery(null));
  model.aggregate = jest.fn().mockReturnValue(buildQuery([]));
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
  let conversions: { reportLeadStage: jest.Mock };
  let leadModel: any;
  let activityModel: any;
  let customerModel: any;
  let userModel: any;
  let push: { sendToUser: jest.Mock };
  let nativePush: { sendToUser: jest.Mock };
  let stageModel: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    leadModel = createMockModel();
    activityModel = createMockModel();
    customerModel = createMockModel();
    activityModel.create.mockResolvedValue({ _id: new Types.ObjectId() });
    conversions = { reportLeadStage: jest.fn().mockResolvedValue(null) };
    userModel = createMockModel();
    push = { sendToUser: jest.fn().mockResolvedValue(1) };
    nativePush = { sendToUser: jest.fn().mockResolvedValue(1) };
    // Embudo del tenant: por defecto, el de fábrica ya sembrado.
    stageModel = createMockModel();
    stageModel.find.mockReturnValue(
      buildQuery(LEAD_STAGES.map((s) => ({ ...s }))),
    );
    stageModel.insertMany = jest.fn().mockResolvedValue([]);
    stageModel.bulkWrite = jest.fn().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        LeadStagesService,
        { provide: getModelToken(LeadStageEntry.name), useValue: stageModel },
        { provide: getModelToken(Lead.name), useValue: leadModel },
        { provide: getModelToken(LeadActivity.name), useValue: activityModel },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: ConversionsService, useValue: conversions },
        {
          provide: RolesService,
          useValue: {
            modulesFor: jest.fn((_t: string, role: string) =>
              Promise.resolve(role === 'KITCHEN' ? ['kds'] : ['leads']),
            ),
          },
        },
        { provide: PushService, useValue: push },
        { provide: NativePushService, useValue: nativePush },
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
        { ownerId: null },
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
        .mockReturnValueOnce(buildQuery(1)) // perdidos histórico
        .mockReturnValueOnce(buildQuery(4)); // sin asignar

      const stats = await service.stats(tenantId, userId, 'TENANT_ADMIN');

      expect(stats.open).toBe(2);
      expect(stats.openValue).toBe(3000);
      expect(stats.weightedValue).toBe(1400); // 1000*0.1 + 2000*0.65
      expect(stats.wonThisMonth).toBe(1);
      expect(stats.wonValueThisMonth).toBe(500);
      expect(stats.conversionRate).toBe(75); // 3 de 4 cerradas
      expect(stats.unassigned).toBe(4);
      expect(stats.mine).toBe(2);
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
      const existing: Record<string, unknown> = {
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

      expect(existing['email']).toBe('ana@mail.com');
      expect(existing['save']).toHaveBeenCalled();
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

    it('reports the conversion when the lead reaches a stage that counts', async () => {
      const lead = makeLead({ stage: 'contacted' });
      leadModel.find.mockReturnValue(buildQuery([lead]));

      await service.move(String(leadOid), tenantId, userId, 'TENANT_ADMIN', {
        stage: 'qualified',
      });

      expect(conversions.reportLeadStage).toHaveBeenCalledWith(
        lead,
        'contacted',
      );
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

  describe('reparto', () => {
    const other = new Types.ObjectId();
    const pedro = { _id: other, name: 'Pedro', email: 'p@x.pe' };
    const users = [
      {
        _id: new Types.ObjectId(userId),
        name: 'Ana',
        email: 'a@x.pe',
        role: 'MARKETING',
      },
      { _id: other, name: 'Pedro', email: 'p@x.pe', role: 'IMPULSADOR' },
      {
        _id: new Types.ObjectId(),
        name: 'Cocina',
        email: 'k@x.pe',
        role: 'KITCHEN',
      },
    ];
    const modified = (n: number) => buildQuery({ modifiedCount: n });

    beforeEach(() => {
      userModel.find.mockReturnValue(buildQuery(users));
      userModel.findById.mockReturnValue(buildQuery({ name: 'Ana' }));
    });

    it('toma una oportunidad de la bolsa de forma atómica', async () => {
      const pool = makeLead({ ownerId: undefined });
      leadModel.find.mockReturnValue(buildQuery([pool]));
      leadModel.updateOne.mockReturnValue(modified(1));

      await service.claim(String(leadOid), tenantId, userId, 'MARKETING');

      const [filter, update] = leadModel.updateOne.mock.calls[0];
      expect(filter).toMatchObject({ _id: leadOid, ownerId: null });
      expect(update.$set.ownerId).toEqual(new Types.ObjectId(userId));
      expect(activityModel.create.mock.calls[0][0]).toMatchObject({
        type: 'assignment',
        title: 'Ana la tomó',
      });
    });

    it('si otra persona la tomó primero, avisa quién', async () => {
      leadModel.find
        .mockReturnValueOnce(buildQuery([makeLead({ ownerId: undefined })]))
        .mockReturnValueOnce(buildQuery([makeLead({ ownerId: pedro })]));
      leadModel.updateOne.mockReturnValue(modified(0));

      await expect(
        service.claim(String(leadOid), tenantId, userId, 'MARKETING'),
      ).rejects.toThrow(new ConflictException('Ya la tomó Pedro'));
      expect(activityModel.create).not.toHaveBeenCalled();
    });

    it('no se puede tomar una que ya tiene responsable', async () => {
      leadModel.find.mockReturnValue(
        buildQuery([makeLead({ ownerId: pedro })]),
      );
      await expect(
        service.claim(String(leadOid), tenantId, userId, 'MANAGER'),
      ).rejects.toThrow(ConflictException);
      expect(leadModel.updateOne).not.toHaveBeenCalled();
    });

    it('bloquea el trabajo sobre una oportunidad ajena o sin tomar', async () => {
      leadModel.find.mockReturnValue(
        buildQuery([makeLead({ ownerId: pedro })]),
      );
      await expect(
        service.move(String(leadOid), tenantId, userId, 'MARKETING', {
          stage: 'won',
        }),
      ).rejects.toThrow('La lleva Pedro');

      leadModel.find.mockReturnValue(
        buildQuery([makeLead({ ownerId: undefined })]),
      );
      await expect(
        service.addActivity(String(leadOid), tenantId, userId, 'MARKETING', {
          type: 'note',
          title: 'x',
        }),
      ).rejects.toThrow('tómala');
    });

    it('quien supervisa puede trabajar cualquiera', async () => {
      const lead = makeLead({ ownerId: pedro });
      leadModel.find.mockReturnValue(buildQuery([lead]));
      await service.move(String(leadOid), tenantId, userId, 'MANAGER', {
        stage: 'won',
      });
      expect(lead.status).toBe('won');
    });

    it('el responsable la suelta y vuelve a la bolsa', async () => {
      leadModel.find.mockReturnValue(buildQuery([makeLead()]));
      await service.release(String(leadOid), tenantId, userId, 'MARKETING', {
        reason: 'No es mi zona',
      });
      expect(leadModel.updateOne.mock.calls[0][1].$unset).toEqual({
        ownerId: 1,
        assignedAt: 1,
      });
      expect(activityModel.create.mock.calls[0][0].title).toBe(
        'Ana la soltó — No es mi zona',
      );
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('nadie más puede soltar una ajena; quien supervisa sí, y avisa', async () => {
      leadModel.find.mockReturnValue(
        buildQuery([makeLead({ ownerId: pedro })]),
      );
      await expect(
        service.release(String(leadOid), tenantId, userId, 'MARKETING', {}),
      ).rejects.toThrow(ForbiddenException);

      await service.release(String(leadOid), tenantId, userId, 'MANAGER', {});
      expect(activityModel.create.mock.calls[0][0].title).toBe(
        'Ana se la quitó a Pedro',
      );
      expect(push.sendToUser.mock.calls[0][0]).toBe(String(other));
    });

    it('deriva a otra persona del equipo y le avisa con la nota', async () => {
      leadModel.find.mockReturnValue(buildQuery([makeLead()]));
      await service.transfer(String(leadOid), tenantId, userId, 'MARKETING', {
        toUserId: String(other),
        note: 'Cliente de Surco',
      });
      expect(leadModel.updateOne.mock.calls[0][1].$set.ownerId).toEqual(other);
      expect(activityModel.create.mock.calls[0][0]).toMatchObject({
        type: 'assignment',
        title: 'Ana se la derivó a Pedro',
        body: 'Cliente de Surco',
      });
      expect(push.sendToUser).toHaveBeenCalledWith(
        String(other),
        expect.objectContaining({
          title: 'Te derivaron una oportunidad',
          url: `/leads?lead=${String(leadOid)}`,
        }),
      );
      expect(nativePush.sendToUser).toHaveBeenCalled();
    });

    it('solo deriva a usuarios activos con acceso a Seguimiento', async () => {
      leadModel.find.mockReturnValue(buildQuery([makeLead()]));
      await expect(
        service.transfer(String(leadOid), tenantId, userId, 'MARKETING', {
          toUserId: String(users[2]._id),
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.transfer(String(leadOid), tenantId, userId, 'MARKETING', {
          toUserId: userId,
        }),
      ).rejects.toThrow('ya lleva');
    });

    it('no deriva una ajena sin supervisar', async () => {
      leadModel.find.mockReturnValue(
        buildQuery([makeLead({ ownerId: pedro })]),
      );
      await expect(
        service.transfer(String(leadOid), tenantId, userId, 'MARKETING', {
          toUserId: userId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cambiar el responsable al editar pasa por derivar', async () => {
      leadModel.find.mockReturnValue(buildQuery([makeLead()]));
      await service.update(String(leadOid), tenantId, userId, 'MARKETING', {
        title: 'Nuevo título',
        ownerId: String(other),
      });
      expect(leadModel.updateOne.mock.calls[0][1].$set.ownerId).toEqual(other);
      expect(push.sendToUser).toHaveBeenCalled();
    });

    it('responsables: solo roles con Seguimiento y su carga abierta', async () => {
      leadModel.aggregate.mockReturnValue(
        buildQuery([{ _id: other, count: 3 }]),
      );
      const owners = await service.owners(tenantId);
      expect(owners.map((o) => [o.name, o.openLeads])).toEqual([
        ['Ana', 0],
        ['Pedro', 3],
      ]);
    });

    it('filtra por bolsa y por mías', async () => {
      await service.board(tenantId, userId, 'MANAGER', { ownerId: 'none' });
      expect(leadModel.find.mock.calls[0][0].ownerId).toBeNull();
      await service.board(tenantId, userId, 'MANAGER', { ownerId: 'me' });
      expect(leadModel.find.mock.calls[1][0].ownerId).toEqual(
        new Types.ObjectId(userId),
      );
    });

    it('crear con responsable vacío la deja en la bolsa', async () => {
      customerModel.findOne.mockReturnValue(buildQuery({ _id: customerOid }));
      leadModel.create.mockResolvedValue(makeLead({ ownerId: undefined }));
      leadModel.find.mockReturnValue(
        buildQuery([makeLead({ ownerId: undefined })]),
      );

      await service.create(tenantId, userId, 'MARKETING', {
        customerId: String(customerOid),
        title: 'Bolsa',
        ownerId: '',
      });
      expect(leadModel.create.mock.calls[0][0].ownerId).toBeUndefined();
      expect(activityModel.create.mock.calls[1][0].title).toBe(
        'Queda sin asignar',
      );
    });
  });

  describe('embudo del tenant', () => {
    const custom = [
      {
        key: 'lost',
        label: 'Descartado',
        order: 0,
        color: '#EF4444',
        probability: 0,
        outcome: 'lost',
      },
      {
        key: 'cita-a1b2',
        label: 'Cita agendada',
        order: 1,
        color: '#0EA5E9',
        probability: 40,
      },
      {
        key: 'won',
        label: 'Cerrado',
        order: 2,
        color: '#10B981',
        probability: 100,
        outcome: 'won',
      },
    ];

    beforeEach(() => {
      stageModel.find.mockReturnValue(buildQuery(custom));
      customerModel.findOne.mockReturnValue(buildQuery({ _id: customerOid }));
      leadModel.create.mockResolvedValue(makeLead({ stage: 'cita-a1b2' }));
      leadModel.find.mockReturnValue(buildQuery([makeLead()]));
    });

    it('siembra las etapas de fábrica si el tenant no tiene ninguna', async () => {
      stageModel.find
        .mockReturnValueOnce(buildQuery([]))
        .mockReturnValueOnce(buildQuery(LEAD_STAGES.map((s) => ({ ...s }))));

      const stages = await service.stages(tenantId);

      expect(stageModel.insertMany).toHaveBeenCalledTimes(1);
      expect(stageModel.insertMany.mock.calls[0][0]).toHaveLength(7);
      expect(stages.map((s) => s.key)).toEqual(LEAD_STAGES.map((s) => s.key));
    });

    it('sin etapa, crea en la primera etapa abierta del embudo', async () => {
      await service.create(tenantId, userId, 'MARKETING', {
        customerId: String(customerOid),
        title: 'Cita',
      });
      expect(leadModel.create.mock.calls[0][0]).toMatchObject({
        stage: 'cita-a1b2',
        status: 'open',
      });
    });

    it('crear en la etapa ganada la cierra', async () => {
      await service.create(tenantId, userId, 'MARKETING', {
        customerId: String(customerOid),
        title: 'Venta',
        stage: 'won',
      });
      const doc = leadModel.create.mock.calls[0][0];
      expect(doc.status).toBe('won');
      expect(doc.closedAt).toBeInstanceOf(Date);
    });

    it('rechaza etapas que no existen en el embudo del tenant', async () => {
      await expect(
        service.create(tenantId, userId, 'MARKETING', {
          customerId: String(customerOid),
          title: 'X',
          stage: 'proposal',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(leadModel.create).not.toHaveBeenCalled();

      await expect(
        service.move(String(leadOid), tenantId, userId, 'TENANT_ADMIN', {
          stage: 'nope',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.update(String(leadOid), tenantId, userId, 'TENANT_ADMIN', {
          stage: 'nope',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('el historial usa las etiquetas del tenant', async () => {
      const lead = makeLead({ stage: 'cita-a1b2' });
      leadModel.find.mockReturnValue(buildQuery([lead]));

      await service.move(String(leadOid), tenantId, userId, 'TENANT_ADMIN', {
        stage: 'lost',
      });

      expect(lead.status).toBe('lost');
      expect(activityModel.create.mock.calls[0][0].title).toBe(
        'Etapa: Cita agendada → Descartado',
      );
    });

    it('tablero y ponderado siguen el embudo configurado', async () => {
      leadModel.find.mockReturnValue(
        buildQuery([makeLead({ stage: 'cita-a1b2', value: 500 })]),
      );
      const board = await service.board(tenantId, userId, 'TENANT_ADMIN');
      expect(board.map((c) => [c.stage, c.label, c.count])).toEqual([
        ['lost', 'Descartado', 0],
        ['cita-a1b2', 'Cita agendada', 1],
        ['won', 'Cerrado', 0],
      ]);

      leadModel.find
        .mockReturnValueOnce(
          buildQuery([makeLead({ stage: 'cita-a1b2', value: 1000 })]),
        )
        .mockReturnValueOnce(buildQuery([]))
        .mockReturnValueOnce(buildQuery([]));
      const stats = await service.stats(tenantId, userId, 'TENANT_ADMIN');
      expect(stats.weightedValue).toBe(400);
    });
  });
});
