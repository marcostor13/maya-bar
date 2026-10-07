import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MessageTemplatesService } from './message-templates.service';
import { MessageTemplate } from './message-template.schema';
import { Customer } from '../customers/customer.schema';
import { Tenant } from '../tenants/tenant.schema';

const query = <T>(value: T) => {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'limit', 'lean']) q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(value);
  return q;
};

describe('MessageTemplatesService', () => {
  const tenantId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  let service: MessageTemplatesService;
  let model: Record<string, jest.Mock>;
  let customers: Record<string, jest.Mock>;

  beforeEach(async () => {
    model = {
      find: jest.fn(() => query([])),
      findOne: jest.fn(() => query(null)),
      create: jest.fn((doc: unknown) => Promise.resolve(doc)),
      deleteOne: jest.fn(() => query({})),
    };
    customers = {
      find: jest.fn(() => query([])),
      findOne: jest.fn(() => query(null)),
    };
    const mod = await Test.createTestingModule({
      providers: [
        MessageTemplatesService,
        { provide: getModelToken(MessageTemplate.name), useValue: model },
        { provide: getModelToken(Customer.name), useValue: customers },
        {
          provide: getModelToken(Tenant.name),
          useValue: { findById: jest.fn(() => query({ name: 'Maya' })) },
        },
      ],
    }).compile();
    service = mod.get(MessageTemplatesService);
  });

  it('lista las de la empresa, opcionalmente por canal', async () => {
    await service.findAll(tenantId, 'sms');
    const filter = model.find.mock.calls[0][0];
    expect(filter.tenantId.toString()).toBe(tenantId);
    expect(filter.channel).toBe('sms');
  });

  it('una plantilla de otra empresa no se puede leer, editar ni borrar', async () => {
    const id = new Types.ObjectId().toString();
    await expect(service.findOne(id, tenantId)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.update(id, tenantId, { name: 'x' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove(id, tenantId)).rejects.toThrow(
      NotFoundException,
    );
    for (const call of model.findOne.mock.calls)
      expect(call[0].tenantId.toString()).toBe(tenantId);
    expect(model.deleteOne).not.toHaveBeenCalled();
  });

  it('el asunto solo se guarda en plantillas de email', async () => {
    await service.create(tenantId, userId, {
      name: ' Aviso ',
      channel: 'sms',
      subject: 'no aplica',
      body: 'Hola {nombre}',
    });
    expect(model.create.mock.calls[0][0]).toMatchObject({
      name: 'Aviso',
      channel: 'sms',
      subject: undefined,
    });

    await service.create(tenantId, userId, {
      name: 'Correo',
      channel: 'email',
      subject: ' Hola ',
      body: 'x',
    });
    expect(model.create.mock.calls[1][0].subject).toBe('Hola');
  });

  it('ofrece como variables los campos personalizados que existen en la empresa', async () => {
    customers.find.mockReturnValue(
      query([
        { customFields: { Ciudad: 'Lima', vacio: null, anidado: { a: 1 } } },
        { customFields: { Ciudad: 'Cusco', Plan: 'Pro' } },
      ]),
    );

    const vars = await service.variables(tenantId);

    expect(customers.find.mock.calls[0][0].tenantId.toString()).toBe(tenantId);
    expect(vars.find((v) => v.token === '{empresa}')?.example).toBe('Maya');
    expect(vars.filter((v) => v.token.startsWith('{campo:'))).toEqual([
      { token: '{campo:Ciudad}', label: 'Ciudad', example: 'Lima' },
      { token: '{campo:Plan}', label: 'Plan', example: 'Pro' },
    ]);
  });

  describe('preview', () => {
    it('con datos de ejemplo: resuelve, avisa de variables mal escritas y cuenta segmentos', async () => {
      const out = await service.preview(tenantId, {
        body: 'Hola {primer_nombre} de {empresa}, mira {link} {nonbre}',
        subject: 'Para {nombre}',
      });
      expect(out.body).toBe(
        'Hola María de Maya, mira https://go.link/aB3xK9p {nonbre}',
      );
      expect(out.subject).toBe('Para María Pérez');
      expect(out.unknown).toEqual(['{nonbre}']);
      expect(out.sms.segments).toBe(1);
    });

    it('con un contacto real usa sus datos, y solo si es de la empresa', async () => {
      const id = new Types.ObjectId().toString();
      await expect(
        service.preview(tenantId, { body: 'x', customerId: id }),
      ).rejects.toThrow(NotFoundException);
      expect(customers.findOne.mock.calls[0][0].tenantId.toString()).toBe(
        tenantId,
      );

      customers.findOne.mockReturnValue(
        query({ name: 'Luis Ramos', customFields: { Ciudad: 'Cusco' } }),
      );
      const out = await service.preview(tenantId, {
        body: '{nombre} — {campo:ciudad}',
        customerId: id,
      });
      expect(out.body).toBe('Luis Ramos — Cusco');
    });
  });
});
