import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { InboxToolsService } from './inbox-tools.service';

const TENANT = new Types.ObjectId().toString();
const CONV = new Types.ObjectId();
const USER = new Types.ObjectId().toString();

function setup() {
  const conv = {
    _id: CONV,
    tenantId: new Types.ObjectId(TENANT),
    channel: 'whatsapp',
    customerId: undefined,
  };
  const scheduledModel = {
    create: jest.fn((doc: Record<string, unknown>) =>
      Promise.resolve({ _id: new Types.ObjectId(), ...doc }),
    ),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(() => ({ exec: () => Promise.resolve({}) })),
  };
  const conversations = {
    getConversation: jest.fn(() => Promise.resolve(conv)),
    sendManual: jest.fn(),
    sendToPipeline: jest.fn(),
  };
  const gateway = { emitScheduledChanged: jest.fn() };
  const leads = {
    addActivity: jest.fn(),
    findByCustomer: jest.fn(),
    listActivities: jest.fn(),
    updateActivity: jest.fn(),
  };
  const service = new InboxToolsService(
    scheduledModel as never,
    {} as never,
    conversations as never,
    gateway as never,
    {} as never,
    leads as never,
  );
  return { service, scheduledModel, conversations, gateway, leads, conv };
}

describe('InboxToolsService', () => {
  describe('schedule', () => {
    it('rechaza una hora que no está al menos un minuto en el futuro', async () => {
      const { service, scheduledModel } = setup();
      await expect(
        service.schedule(String(CONV), TENANT, USER, {
          text: 'hola',
          sendAt: new Date().toISOString(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(scheduledModel.create).not.toHaveBeenCalled();
    });

    it('rechaza un mensaje vacío', async () => {
      const { service } = setup();
      const sendAt = new Date(Date.now() + 3_600_000).toISOString();
      await expect(
        service.schedule(String(CONV), TENANT, USER, { text: '  ', sendAt }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('guarda el mensaje pendiente con su hora', async () => {
      const { service, scheduledModel } = setup();
      const sendAt = new Date(Date.now() + 3_600_000);
      await service.schedule(String(CONV), TENANT, USER, {
        text: ' Hola ',
        sendAt: sendAt.toISOString(),
      });
      expect(scheduledModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          type: 'text',
          text: 'Hola',
          sendAt,
          conversationId: CONV,
        }),
      );
    });
  });

  describe('deliverDue', () => {
    it('envía lo vencido sin pausar al agente y lo marca como enviado', async () => {
      const { service, scheduledModel, conversations, gateway } = setup();
      const job = {
        _id: new Types.ObjectId(),
        tenantId: new Types.ObjectId(TENANT),
        conversationId: CONV,
        createdBy: new Types.ObjectId(USER),
        type: 'text',
        text: 'Recordatorio',
        status: 'sending',
        save: jest.fn(() => Promise.resolve()),
      };
      scheduledModel.findOneAndUpdate
        .mockReturnValueOnce({ exec: () => Promise.resolve(job) })
        .mockReturnValueOnce({ exec: () => Promise.resolve(null) });
      const msgId = new Types.ObjectId();
      conversations.sendManual.mockResolvedValue({
        _id: msgId,
        status: 'pending',
      });

      await service.deliverDue();

      expect(conversations.sendManual).toHaveBeenCalledWith(
        String(CONV),
        TENANT,
        USER,
        expect.objectContaining({ text: 'Recordatorio', pauseAgent: false }),
      );
      expect(job.status).toBe('sent');
      expect(job.save).toHaveBeenCalled();
      expect(gateway.emitScheduledChanged).toHaveBeenCalledWith(
        TENANT,
        String(CONV),
      );
    });

    it('marca como fallido si el envío revienta', async () => {
      const { service, scheduledModel, conversations } = setup();
      const job = {
        _id: new Types.ObjectId(),
        tenantId: new Types.ObjectId(TENANT),
        conversationId: CONV,
        createdBy: new Types.ObjectId(USER),
        type: 'text',
        text: 'x',
        status: 'sending',
        save: jest.fn(() => Promise.resolve()),
      } as Record<string, unknown> & { save: jest.Mock };
      scheduledModel.findOneAndUpdate
        .mockReturnValueOnce({ exec: () => Promise.resolve(job) })
        .mockReturnValueOnce({ exec: () => Promise.resolve(null) });
      conversations.sendManual.mockRejectedValue(new Error('boom'));

      await service.deliverDue();

      expect(job.status).toBe('failed');
      expect(job.error).toContain('boom');
    });
  });

  it('cancelar algo que ya salió da 404', async () => {
    const { service, scheduledModel } = setup();
    scheduledModel.findOneAndUpdate.mockReturnValue({
      exec: () => Promise.resolve(null),
    });
    await expect(
      service.cancelScheduled(
        String(CONV),
        new Types.ObjectId().toString(),
        TENANT,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea la tarea como `task` en la oportunidad del chat', async () => {
    const { service, conversations, leads } = setup();
    const leadId = new Types.ObjectId();
    conversations.sendToPipeline.mockResolvedValue({
      lead: { _id: leadId },
      created: true,
    });
    leads.addActivity.mockResolvedValue({ _id: new Types.ObjectId() });
    const dueAt = new Date(Date.now() + 86_400_000).toISOString();

    const res = await service.createTask(
      String(CONV),
      TENANT,
      USER,
      'TENANT_ADMIN',
      {
        type: 'call',
        title: 'Volver a llamar a Ana',
        dueAt,
      },
    );

    expect(leads.addActivity).toHaveBeenCalledWith(
      String(leadId),
      TENANT,
      USER,
      'TENANT_ADMIN',
      expect.objectContaining({
        type: 'task',
        title: 'Volver a llamar a Ana',
        dueAt,
      }),
    );
    expect(res).toMatchObject({ leadId: String(leadId), leadCreated: true });
  });
});
