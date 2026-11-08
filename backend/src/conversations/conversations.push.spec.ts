import { Types } from 'mongoose';
import { ConversationsService, inboundPushBody } from './conversations.service';

describe('inboundPushBody', () => {
  it('recorta el extracto a 100 caracteres con puntos suspensivos', () => {
    const body = inboundPushBody('a'.repeat(300), 1);
    expect(body.length).toBe(100);
    expect(body.endsWith('…')).toBe(true);
  });

  it('deja intacto un texto corto y compacta los espacios', () => {
    expect(inboundPushBody('  Hola,\n  ¿tienen stock?  ', 1)).toBe(
      'Hola, ¿tienen stock?',
    );
  });

  it('con varios sin leer dice cuántos son', () => {
    expect(inboundPushBody('Último mensaje', 3)).toBe(
      '3 mensajes nuevos · Último mensaje',
    );
  });
});

describe('Derivación a humano', () => {
  it('avisa por Web Push y también por FCM a quien tenga la bandeja', async () => {
    const push = { sendToTenant: jest.fn().mockResolvedValue(1) };
    const nativePush = { sendToTenantModule: jest.fn().mockResolvedValue(1) };
    const gateway = { emitConversation: jest.fn(), emitMessage: jest.fn() };
    const msgModel = { create: jest.fn((d: unknown) => Promise.resolve(d)) };
    const handoff = {
      notify: jest.fn().mockResolvedValue({ notified: ['Ana'] }),
    };
    const nulls = Array.from({ length: 21 }, () => ({}) as never);
    const args: unknown[] = [...nulls];
    args[1] = msgModel;
    args[11] = gateway;
    args[12] = handoff;
    args[14] = push;
    args[15] = nativePush;
    const svc = new (ConversationsService as unknown as new (
      ...a: unknown[]
    ) => InstanceType<typeof ConversationsService>)(...args);
    const tenantId = new Types.ObjectId();
    const conv = {
      _id: new Types.ObjectId(),
      tenantId,
      channel: 'whatsapp',
      contact: '51999',
      contactName: 'Luis',
      save: jest.fn().mockResolvedValue(undefined),
    };
    await (
      svc as unknown as {
        escalateToHuman: (...a: unknown[]) => Promise<void>;
      }
    ).escalateToHuman(conv, {}, 'quiere hablar con alguien', 'hola');

    expect(push.sendToTenant).toHaveBeenCalledWith(
      String(tenantId),
      expect.objectContaining({ category: 'chats' }),
      { moduleKey: 'inbox' },
    );
    expect(nativePush.sendToTenantModule).toHaveBeenCalledWith(
      String(tenantId),
      'inbox',
      expect.objectContaining({
        category: 'chats',
        body: 'Luis · quiere hablar con alguien',
        data: expect.objectContaining({
          route: `/inbox?c=${String(conv._id)}`,
        }),
      }),
    );
  });
});

describe('Mensaje entrante en un chat con dueño', () => {
  it('solo avisa al dueño, por los dos canales, con el badge de no leídos', async () => {
    const push = {
      sendToUser: jest.fn().mockResolvedValue(1),
      sendToTenant: jest.fn(),
    };
    const nativePush = {
      sendToUser: jest.fn().mockResolvedValue(1),
      sendToTenantModule: jest.fn(),
    };
    const convModel = {
      aggregate: jest.fn().mockResolvedValue([{ total: 5 }]),
    };
    const args: unknown[] = Array.from({ length: 21 }, () => ({}));
    args[0] = convModel;
    args[14] = push;
    args[15] = nativePush;
    const svc = new (ConversationsService as unknown as new (
      ...a: unknown[]
    ) => InstanceType<typeof ConversationsService>)(...args);
    const owner = new Types.ObjectId();
    const conv = {
      _id: new Types.ObjectId(),
      tenantId: new Types.ObjectId(),
      channel: 'whatsapp',
      contact: '51999',
      contactName: 'Luis',
      unreadCount: 2,
      takenOverBy: owner,
    };
    await (
      svc as unknown as { notifyInbound: (...a: unknown[]) => Promise<void> }
    ).notifyInbound(conv, { type: 'text', text: '¿Siguen abiertos?' });

    expect(push.sendToTenant).not.toHaveBeenCalled();
    expect(nativePush.sendToTenantModule).not.toHaveBeenCalled();
    expect(push.sendToUser).toHaveBeenCalledWith(
      String(owner),
      expect.objectContaining({
        body: '2 mensajes nuevos · ¿Siguen abiertos?',
        badge: 5,
        category: 'chats',
      }),
    );
    expect(nativePush.sendToUser).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ badge: 5, tag: `conv_${String(conv._id)}` }),
    );
  });
});
