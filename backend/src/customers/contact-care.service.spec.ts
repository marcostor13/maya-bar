import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ContactCareService } from './contact-care.service';
import { Customer } from './customer.schema';
import { ContactActivity } from './contact-activity.schema';
import { User } from '../users/user.schema';
import { Lead } from '../leads/lead.schema';
import { LeadActivity } from '../leads/lead-activity.schema';
import { RolesService } from '../roles/roles.service';

const query = <T>(value: T) => {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'limit', 'lean', 'populate', 'select'])
    q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(value);
  return q;
};

const mockModel = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(() => query({})),
  updateMany: jest.fn(() => query({ matchedCount: 0 })),
  deleteOne: jest.fn(() => query({})),
  aggregate: jest.fn(() => query([])),
  create: jest.fn(),
  insertMany: jest.fn(),
});

describe('ContactCareService', () => {
  const tenantId = new Types.ObjectId().toString();
  const agent = new Types.ObjectId().toString();
  const other = new Types.ObjectId().toString();

  let service: ContactCareService;
  let customers: ReturnType<typeof mockModel>;
  let activities: ReturnType<typeof mockModel>;
  let users: ReturnType<typeof mockModel>;

  const customer = (over: Record<string, unknown> = {}) => {
    const doc = {
      _id: new Types.ObjectId(),
      tenantId: new Types.ObjectId(tenantId),
      ownerId: undefined as Types.ObjectId | undefined,
      save: jest.fn().mockResolvedValue(undefined),
      populate: jest.fn(),
      ...over,
    };
    doc.populate.mockResolvedValue(doc);
    return doc;
  };

  beforeEach(async () => {
    customers = mockModel();
    activities = mockModel();
    users = mockModel();
    users.findOne.mockReturnValue(query({ name: 'Ana', email: 'ana@x.com' }));

    const mod = await Test.createTestingModule({
      providers: [
        ContactCareService,
        { provide: getModelToken(Customer.name), useValue: customers },
        { provide: getModelToken(ContactActivity.name), useValue: activities },
        { provide: getModelToken(User.name), useValue: users },
        { provide: getModelToken(Lead.name), useValue: mockModel() },
        { provide: getModelToken(LeadActivity.name), useValue: mockModel() },
        { provide: RolesService, useValue: { modulesFor: jest.fn() } },
      ],
    }).compile();
    service = mod.get(ContactCareService);
  });

  it('busca el contacto siempre dentro del tenant', async () => {
    customers.findOne.mockReturnValue(query(null));
    await expect(
      service.claim(
        new Types.ObjectId().toString(),
        tenantId,
        agent,
        'MARKETING',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(customers.findOne.mock.calls[0][0].tenantId.toString()).toBe(
      tenantId,
    );
  });

  it('claim asigna al agente y lo deja en el historial', async () => {
    const doc = customer();
    customers.findOne.mockReturnValue(query(doc));
    customers.findOneAndUpdate.mockReturnValue(query(doc));

    await service.claim(doc._id.toString(), tenantId, agent, 'MARKETING');

    // Solo toma contactos libres: es lo que lo hace atómico.
    expect(customers.findOneAndUpdate.mock.calls[0][0].ownerId).toBeNull();
    const logged = activities.create.mock.calls[0][0];
    expect(logged.type).toBe('assignment');
    expect(logged.toUserId.toString()).toBe(agent);
    expect(logged.createdBy.toString()).toBe(agent);
  });

  it('claim falla si otro ya lo tomó', async () => {
    const doc = customer();
    customers.findOne.mockReturnValue(query(doc));
    customers.findOneAndUpdate.mockReturnValue(query(null));
    await expect(
      service.claim(doc._id.toString(), tenantId, agent, 'MARKETING'),
    ).rejects.toThrow(ConflictException);
    expect(activities.create).not.toHaveBeenCalled();
  });

  it('un agente no puede quitarle el contacto a otro', async () => {
    const doc = customer({ ownerId: new Types.ObjectId(other) });
    customers.findOne.mockReturnValue(query(doc));
    await expect(
      service.assign(doc._id.toString(), tenantId, agent, 'MARKETING', agent),
    ).rejects.toThrow(ForbiddenException);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('un supervisor deriva y queda registrado de quién a quién', async () => {
    const doc = customer({ ownerId: new Types.ObjectId(other) });
    customers.findOne.mockReturnValue(query(doc));

    await service.assign(
      doc._id.toString(),
      tenantId,
      agent,
      'MANAGER',
      agent,
      'vacaciones',
    );

    expect(String(doc.ownerId)).toBe(agent);
    const logged = activities.create.mock.calls[0][0];
    expect(logged.fromUserId.toString()).toBe(other);
    expect(logged.toUserId.toString()).toBe(agent);
    expect(logged.body).toBe('vacaciones');
  });

  it('solo un supervisor reparte en bloque a otras personas', async () => {
    await expect(
      service.bulkAssign(
        tenantId,
        agent,
        'MARKETING',
        [new Types.ObjectId().toString()],
        other,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(customers.updateMany).not.toHaveBeenCalled();
  });

  it('los registros automáticos no se pueden borrar', async () => {
    const doc = customer();
    customers.findOne.mockReturnValue(query(doc));
    activities.findOne.mockReturnValue(
      query({
        _id: new Types.ObjectId(),
        type: 'assignment',
        createdBy: agent,
      }),
    );
    await expect(
      service.deleteActivity(
        doc._id.toString(),
        new Types.ObjectId().toString(),
        tenantId,
        agent,
        'TENANT_ADMIN',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(activities.deleteOne).not.toHaveBeenCalled();
  });

  it('un agente no edita registros de otro', async () => {
    const doc = customer();
    customers.findOne.mockReturnValue(query(doc));
    activities.findOne.mockReturnValue(
      query({ _id: new Types.ObjectId(), type: 'call', createdBy: other }),
    );
    await expect(
      service.updateActivity(
        doc._id.toString(),
        new Types.ObjectId().toString(),
        tenantId,
        agent,
        'MARKETING',
        { title: 'x' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
