import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ProspectingService } from './prospecting.service';

const exec = <T>(value: T) => ({ exec: () => Promise.resolve(value) });
const TENANT = new Types.ObjectId().toString();
const USER = new Types.ObjectId().toString();

function setup(prospect: Record<string, unknown>) {
  let current = {
    _id: new Types.ObjectId(),
    tenantId: new Types.ObjectId(TENANT),
    ...prospect,
  };
  const prospectUpdates: {
    filter: unknown;
    update: Record<string, Record<string, unknown>>;
  }[] = [];
  const prospectModel = {
    findOne: jest.fn(() => exec(current)),
    updateOne: jest.fn(
      (filter: unknown, update: Record<string, Record<string, unknown>>) => {
        prospectUpdates.push({ filter, update });
        if (update.$set) current = { ...current, ...update.$set };
        return exec({});
      },
    ),
    updateMany: jest.fn(() => exec({ modifiedCount: 2 })),
  };
  const customer = {
    _id: new Types.ObjectId(),
    notes: '',
    source: 'prospecting',
  };
  const customerModel = {
    findById: jest.fn(() => exec(customer)),
    updateOne: jest.fn(() => exec({})),
  };
  const leads = {
    upsertCustomer: jest.fn(() => Promise.resolve(customer)),
    create: jest.fn(() => Promise.resolve({ _id: new Types.ObjectId() })),
    addActivity: jest.fn(() => Promise.resolve({})),
  };
  const worker = { kick: jest.fn(() => Promise.resolve()) };
  const research = { keys: jest.fn(), hasAi: jest.fn() };
  const service = new ProspectingService(
    {} as never,
    prospectModel as never,
    customerModel as never,
    leads as never,
    worker as never,
    research as never,
  );
  return {
    service,
    prospectModel,
    customerModel,
    leads,
    worker,
    customer,
    prospectUpdates,
    id: String(current._id),
  };
}

describe('ProspectingService', () => {
  it('encola solo prospectos del tenant que no estén ya en curso', async () => {
    const { service, prospectModel, worker } = setup({});
    const ids = [
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
    ];
    await expect(service.queueResearch(ids, TENANT)).resolves.toEqual({
      queued: 2,
    });
    const [filter, update] = prospectModel.updateMany.mock
      .calls[0] as unknown as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ];
    expect(filter['research.state']).toEqual({ $nin: ['queued', 'running'] });
    expect(String(filter.tenantId)).toBe(TENANT);
    expect(update.$set['research.state']).toBe('queued');
    expect(worker.kick).toHaveBeenCalled();
  });

  it('rechaza ids inválidos', async () => {
    const { service } = setup({});
    await expect(
      service.queueResearch(['nope'], TENANT),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no genera material sin investigación', async () => {
    const { service, id } = setup({
      research: { state: 'idle' },
      material: { state: 'idle' },
    });
    await expect(service.queueMaterial(id, TENANT)).rejects.toThrow(
      'Primero investiga',
    );
  });

  it('crea el contacto de la empresa con sus datos y lo reutiliza después', async () => {
    const { service, leads, customerModel, id } = setup({
      name: 'Alfa SAC',
      website: 'https://alfa.pe/',
      industry: 'Salud',
      research: {
        state: 'done',
        emails: ['hola@alfa.pe'],
        phones: ['+51999'],
        ai: { summary: 'Clínica' },
      },
    });

    await service.toCustomer(id, TENANT, USER, 'TENANT_ADMIN', {});
    expect(leads.upsertCustomer).toHaveBeenCalledWith(
      TENANT,
      USER,
      'TENANT_ADMIN',
      {
        name: 'Alfa SAC',
        email: 'hola@alfa.pe',
        phone: '+51999',
        source: 'prospecting',
      },
    );
    const [, update] = customerModel.updateOne.mock.calls[0] as unknown as [
      unknown,
      Record<string, Record<string, unknown>>,
    ];
    expect(update.$set).toMatchObject({
      'customFields.empresa': 'Alfa SAC',
      'customFields.web': 'https://alfa.pe/',
      notes: 'Clínica',
    });
    expect(update.$addToSet).toEqual({ tags: 'prospección' });

    await service.toCustomer(id, TENANT, USER, 'TENANT_ADMIN', {});
    expect(leads.upsertCustomer).toHaveBeenCalledTimes(1);
  });

  it('crea el contacto de una persona y marca la persona como convertida', async () => {
    const { service, leads, prospectUpdates, id } = setup({
      name: 'Alfa',
      research: {
        state: 'done',
        people: [{ name: 'Ana Ruiz', role: 'CEO', email: 'ana@alfa.pe' }],
      },
    });
    await service.toCustomer(id, TENANT, USER, 'TENANT_ADMIN', {
      personIndex: 0,
    });
    expect(leads.upsertCustomer).toHaveBeenCalledWith(
      TENANT,
      USER,
      'TENANT_ADMIN',
      {
        name: 'Ana Ruiz',
        email: 'ana@alfa.pe',
        phone: undefined,
        source: 'prospecting',
      },
    );
    expect(
      prospectUpdates.some(
        (u) => 'research.people.0.customerId' in (u.update.$set ?? {}),
      ),
    ).toBe(true);
    await expect(
      service.toCustomer(id, TENANT, USER, 'TENANT_ADMIN', { personIndex: 5 }),
    ).rejects.toThrow('Persona no encontrada');
  });

  it('crea el seguimiento con la investigación y deja el prospecto en seguimiento', async () => {
    const { service, leads, prospectUpdates, id } = setup({
      name: 'Alfa',
      fitReason: 'Web lenta',
      research: {
        state: 'done',
        ai: {
          summary: 'Clínica',
          opportunities: ['Agendamiento online'],
          talkingPoints: ['Reseñas'],
        },
      },
      material: {
        state: 'done',
        outreach: { emailSubject: 'Idea', email: 'Hola…' },
      },
    });

    const res = await service.toLead(id, TENANT, USER, 'TENANT_ADMIN', {
      value: 1500,
    });

    const dto = (leads.create.mock.calls[0] as unknown[])[3] as Record<
      string,
      unknown
    >;
    expect(dto).toMatchObject({
      title: 'Alfa',
      value: 1500,
      source: 'prospeccion',
      tags: ['prospección'],
    });
    expect(dto.description).toContain('Web lenta');
    expect(dto.description).toContain('• Agendamiento online');
    const note = (leads.addActivity.mock.calls[0] as unknown[])[4] as Record<
      string,
      string
    >;
    expect(note.type).toBe('note');
    expect(note.body).toContain('Correo sugerido — Idea');
    expect(prospectUpdates.at(-1)?.update.$set).toMatchObject({
      status: 'converted',
    });
    expect(res.leadId).toBeDefined();

    await expect(
      service.toLead(id, TENANT, USER, 'TENANT_ADMIN', {}),
    ).rejects.toThrow('ya tiene un seguimiento');
  });
});
