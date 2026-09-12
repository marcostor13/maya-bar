import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { LeadRemindersService } from './lead-reminders.service';
import { Lead } from './lead.schema';
import { LeadActivity } from './lead-activity.schema';
import { User } from '../users/user.schema';
import { PushService } from '../push/push.service';
import { NativePushService } from '../notifications/push.service';
import { SettingsService } from '../settings/settings.service';

const tenantId = new Types.ObjectId();
const ownerId = new Types.ObjectId();
const leadId = new Types.ObjectId();

/** Tarea vencida con `save()` espiable, como la devuelve mongoose. */
function tarea(over: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = {
    _id: new Types.ObjectId(),
    leadId,
    title: 'Llamar para cerrar',
    dueAt: new Date(Date.now() - 60_000),
    done: false,
    remindedAt: null,
    remindByWhatsApp: false,
    save: jest.fn(),
    ...over,
  };
  (doc.save as jest.Mock).mockResolvedValue(doc);
  return doc;
}

describe('LeadRemindersService', () => {
  let service: LeadRemindersService;
  let activityModel: { find: jest.Mock };
  let leadModel: { findById: jest.Mock };
  let userModel: { findById: jest.Mock };
  let push: { sendToUser: jest.Mock; sendToTenant: jest.Mock };
  let nativePush: { sendToUser: jest.Mock; sendToTenantModule: jest.Mock };
  let settings: { sendWhatsApp: jest.Mock };

  const vencidas = (docs: unknown[]) => {
    activityModel.find.mockReturnValue({
      sort: () => ({ limit: () => ({ exec: () => Promise.resolve(docs) }) }),
    });
  };
  const leadDevuelto = (lead: unknown) =>
    leadModel.findById.mockReturnValue({ exec: () => Promise.resolve(lead) });

  beforeEach(async () => {
    activityModel = { find: jest.fn() };
    leadModel = { findById: jest.fn() };
    userModel = { findById: jest.fn() };
    push = {
      sendToUser: jest.fn().mockResolvedValue(1),
      sendToTenant: jest.fn().mockResolvedValue(1),
    };
    nativePush = {
      sendToUser: jest.fn().mockResolvedValue(1),
      sendToTenantModule: jest.fn().mockResolvedValue(1),
    };
    settings = { sendWhatsApp: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LeadRemindersService,
        { provide: getModelToken(LeadActivity.name), useValue: activityModel },
        { provide: getModelToken(Lead.name), useValue: leadModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: PushService, useValue: push },
        { provide: NativePushService, useValue: nativePush },
        { provide: SettingsService, useValue: settings },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://mayacrm.site' },
        },
      ],
    }).compile();

    service = moduleRef.get(LeadRemindersService);
  });

  it('no hace nada si no hay tareas vencidas', async () => {
    vencidas([]);
    await service.enviarPendientes();
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(nativePush.sendToUser).not.toHaveBeenCalled();
  });

  it('avisa al responsable del lead por los dos canales de push', async () => {
    const t = tarea();
    vencidas([t]);
    leadDevuelto({ _id: leadId, tenantId, title: 'Academia Lima', ownerId });

    await service.enviarPendientes();

    expect(push.sendToUser).toHaveBeenCalledWith(
      String(ownerId),
      expect.objectContaining({ body: 'Llamar para cerrar' }),
    );
    expect(nativePush.sendToUser).toHaveBeenCalledWith(
      String(ownerId),
      expect.objectContaining({
        data: expect.objectContaining({ leadId: String(leadId) }),
      }),
    );
  });

  it('marca remindedAt para no repetir el aviso en la pasada siguiente', async () => {
    const t = tarea();
    vencidas([t]);
    leadDevuelto({ _id: leadId, tenantId, title: 'Academia', ownerId });

    await service.enviarPendientes();

    expect(t.remindedAt).toBeInstanceOf(Date);
    expect(t.save).toHaveBeenCalled();
  });

  it('marca remindedAt aunque el envío falle, para no reintentar en bucle', async () => {
    const t = tarea();
    vencidas([t]);
    leadDevuelto({ _id: leadId, tenantId, title: 'Academia', ownerId });
    push.sendToUser.mockRejectedValue(new Error('push caído'));
    nativePush.sendToUser.mockRejectedValue(new Error('fcm caído'));

    await service.enviarPendientes();

    expect(t.remindedAt).toBeInstanceOf(Date);
  });

  it('sin responsable avisa a quien tenga el módulo de seguimiento', async () => {
    vencidas([tarea({ createdBy: undefined })]);
    leadDevuelto({
      _id: leadId,
      tenantId,
      title: 'Academia',
      ownerId: undefined,
    });

    await service.enviarPendientes();

    expect(push.sendToTenant).toHaveBeenCalledWith(
      String(tenantId),
      expect.anything(),
      { moduleKey: 'leads' },
    );
    expect(nativePush.sendToTenantModule).toHaveBeenCalledWith(
      String(tenantId),
      'leads',
      expect.anything(),
    );
  });

  it('manda WhatsApp solo si la tarea lo pide y el responsable tiene teléfono', async () => {
    vencidas([tarea({ remindByWhatsApp: true })]);
    leadDevuelto({ _id: leadId, tenantId, title: 'Academia', ownerId });
    userModel.findById.mockReturnValue({
      select: () => ({
        lean: () => ({ exec: () => Promise.resolve({ phone: '51999888777' }) }),
      }),
    });

    await service.enviarPendientes();

    expect(settings.sendWhatsApp).toHaveBeenCalledWith(
      '51999888777',
      expect.stringContaining('Llamar para cerrar'),
      String(tenantId),
    );
  });

  it('no manda WhatsApp si el responsable no tiene teléfono', async () => {
    vencidas([tarea({ remindByWhatsApp: true })]);
    leadDevuelto({ _id: leadId, tenantId, title: 'Academia', ownerId });
    userModel.findById.mockReturnValue({
      select: () => ({
        lean: () => ({ exec: () => Promise.resolve({ phone: undefined }) }),
      }),
    });

    await service.enviarPendientes();

    expect(settings.sendWhatsApp).not.toHaveBeenCalled();
  });

  it('no manda WhatsApp cuando la tarea no lo pide', async () => {
    vencidas([tarea({ remindByWhatsApp: false })]);
    leadDevuelto({ _id: leadId, tenantId, title: 'Academia', ownerId });

    await service.enviarPendientes();

    expect(settings.sendWhatsApp).not.toHaveBeenCalled();
  });

  it('no avisa de una tarea que venció hace días, pero la cierra', async () => {
    const hace3dias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const t = tarea({ dueAt: hace3dias });
    vencidas([t]);
    leadDevuelto({ _id: leadId, tenantId, title: 'Academia', ownerId });

    await service.enviarPendientes();

    // Si el servicio estuvo caído, el primer barrido no debe disparar una
    // avalancha de avisos de cosas que ya nadie espera.
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(nativePush.sendToUser).not.toHaveBeenCalled();
    expect(t.remindedAt).toBeInstanceOf(Date);
  });

  it('si el lead ya no existe no avisa, pero cierra el recordatorio', async () => {
    const t = tarea();
    vencidas([t]);
    leadDevuelto(null);

    await service.enviarPendientes();

    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(t.remindedAt).toBeInstanceOf(Date);
  });
});
