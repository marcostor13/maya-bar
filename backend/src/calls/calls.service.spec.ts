import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  CallsService,
  callSummary,
  formatDuration,
  parseIceServers,
} from './calls.service';
import type { Call } from './call.schema';

/** Consulta de Mongoose simulada: encadenable y resuelta con `exec`. */
function q<T>(value: T) {
  const chain = {
    exec: jest.fn().mockResolvedValue(value),
    lean: () => chain,
    select: () => chain,
    sort: () => chain,
    skip: () => chain,
    limit: () => chain,
  };
  return chain;
}

const TENANT = new Types.ObjectId();
const ACCOUNT = {
  _id: new Types.ObjectId(),
  tenantId: TENANT,
  label: 'Ventas',
  provider: 'cloudapi',
  waPhoneNumberId: 'PNID',
  active: true,
  calling: undefined as unknown,
};
const CFG = {
  provider: 'cloudapi',
  waPhoneNumberId: 'PNID',
  waAccessToken: 'tok',
};

function callDoc(over: Partial<Call> = {}): Call {
  return {
    _id: new Types.ObjectId(),
    tenantId: TENANT,
    accountId: ACCOUNT._id,
    waCallId: 'wacid.1',
    direction: 'inbound',
    status: 'ringing',
    contact: '51987654321',
    startedAt: new Date(),
    logged: false,
    missedReplySent: false,
    ...over,
  } as unknown as Call;
}

describe('CallsService', () => {
  let callModel: Record<string, jest.Mock>;
  let permModel: Record<string, jest.Mock>;
  let activityModel: { create: jest.Mock };
  let userModel: { findById: jest.Mock };
  let accounts: Record<string, jest.Mock>;
  let meta: Record<string, jest.Mock>;
  let gateway: { emitToCalls: jest.Mock; emitToUser: jest.Mock };
  let conversations: Record<string, jest.Mock>;
  let blocks: { isBlocked: jest.Mock };
  let push: { sendToTenant: jest.Mock };
  let nativePush: { sendToTenantModule: jest.Mock };
  let leads: { upsertCustomer: jest.Mock };
  let service: CallsService;

  beforeEach(() => {
    callModel = {
      exists: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation((d: object) => Promise.resolve(callDoc(d))),
      findOneAndUpdate: jest.fn().mockReturnValue(q(null)),
      findOne: jest.fn().mockReturnValue(q(null)),
      find: jest.fn().mockReturnValue(q([])),
      updateOne: jest.fn().mockReturnValue(q({ modifiedCount: 1 })),
      countDocuments: jest.fn().mockReturnValue(q(0)),
      aggregate: jest.fn().mockReturnValue(q([])),
    };
    permModel = {
      findOne: jest.fn().mockReturnValue(q(null)),
      updateOne: jest.fn().mockReturnValue(q({})),
    };
    activityModel = { create: jest.fn().mockResolvedValue({}) };
    userModel = { findById: jest.fn().mockReturnValue(q({ name: 'Ana' })) };
    accounts = {
      findById: jest.fn().mockResolvedValue(ACCOUNT),
      findAll: jest.fn().mockResolvedValue([ACCOUNT]),
      toConfig: jest.fn().mockReturnValue(CFG),
    };
    meta = {
      action: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue('wacid.out'),
      permission: jest.fn(),
      requestPermission: jest.fn().mockResolvedValue(undefined),
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
    };
    gateway = { emitToCalls: jest.fn(), emitToUser: jest.fn() };
    const conv = { _id: new Types.ObjectId(), contactName: 'Luis' };
    conversations = {
      findWhatsAppChat: jest.fn().mockResolvedValue(null),
      noteCall: jest.fn().mockResolvedValue(conv),
      sendAutomatic: jest.fn().mockResolvedValue(undefined),
      noteInChat: jest.fn().mockResolvedValue(undefined),
    };
    blocks = { isBlocked: jest.fn().mockResolvedValue(false) };
    push = { sendToTenant: jest.fn().mockResolvedValue(1) };
    nativePush = { sendToTenantModule: jest.fn().mockResolvedValue(1) };
    leads = {
      upsertCustomer: jest
        .fn()
        .mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    service = new CallsService(
      callModel as never,
      permModel as never,
      activityModel as never,
      userModel as never,
      accounts as never,
      meta as never,
      gateway as never,
      conversations as never,
      blocks as never,
      push as never,
      nativePush as never,
      leads as never,
      { get: () => undefined } as never,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('servidores ICE: STUN por defecto y TURN desde la variable de entorno', () => {
    expect(parseIceServers(undefined)).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
    ]);
    expect(parseIceServers('no-es-json')).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
    ]);
    const turn = [
      { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' },
    ];
    expect(parseIceServers(JSON.stringify(turn))).toEqual(turn);
  });

  describe('textos', () => {
    it('formatea la duración', () => {
      expect(formatDuration(192)).toBe('3 min 12 s');
      expect(formatDuration(45)).toBe('45 s');
      expect(formatDuration(0)).toBe('0 s');
    });

    it('resume cada final de llamada', () => {
      expect(
        callSummary(
          callDoc({
            status: 'completed',
            durationSec: 192,
            answeredByName: 'Ana',
          }),
        ),
      ).toBe('Llamada entrante · 3 min 12 s · atendió Ana');
      expect(callSummary(callDoc({ status: 'missed' }))).toBe(
        'Llamada entrante perdida',
      );
      expect(
        callSummary(
          callDoc({
            direction: 'outbound',
            status: 'completed',
            durationSec: 65,
            answeredByName: 'Ana',
          }),
        ),
      ).toBe('Llamada saliente · 1 min 5 s · llamó Ana');
      expect(callSummary(callDoc({ status: 'blocked' }))).toContain(
        'bloqueado',
      );
    });
  });

  describe('entrante', () => {
    const ev = {
      id: 'wacid.1',
      contact: '51987654321',
      contactName: 'Luis',
      sdp: 'v=0 offer',
      timestamp: '1700000000',
    };

    it('suena: avisa a la sala de llamadas sin el SDP y manda las dos push', async () => {
      await service.onIncoming(ACCOUNT as never, ev);
      expect(callModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ringing',
          offerSdp: 'v=0 offer',
          waCallId: 'wacid.1',
        }),
      );
      const [tenantId, event, payload] = gateway.emitToCalls.mock.calls[0] as [
        string,
        string,
        { call: object },
      ];
      expect(tenantId).toBe(String(TENANT));
      expect(event).toBe('call:incoming');
      expect(JSON.stringify(payload)).not.toContain('offer');
      expect(payload.call).toMatchObject({
        contact: '51987654321',
        contactName: 'Luis',
        accountLabel: 'Ventas',
      });
      expect(push.sendToTenant).toHaveBeenCalledWith(
        String(TENANT),
        expect.objectContaining({
          title: 'Llamada entrante',
          category: 'calls',
        }),
        { moduleKey: 'calls' },
      );
      expect(nativePush.sendToTenantModule).toHaveBeenCalledWith(
        String(TENANT),
        'calls',
        expect.objectContaining({ category: 'calls' }),
      );
    });

    it('un webhook repetido no crea otra llamada ni vuelve a avisar', async () => {
      callModel.exists.mockResolvedValue({ _id: 'x' });
      await service.onIncoming(ACCOUNT as never, ev);
      expect(callModel.create).not.toHaveBeenCalled();
      expect(gateway.emitToCalls).not.toHaveBeenCalled();
    });

    it('de un contacto bloqueado: rechaza en Meta, queda "blocked" y no avisa a nadie', async () => {
      blocks.isBlocked.mockResolvedValue(true);
      await service.onIncoming(ACCOUNT as never, ev);
      expect(callModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'blocked', logged: true }),
      );
      expect(meta.action).toHaveBeenCalledWith(CFG, 'wacid.1', 'reject');
      expect(gateway.emitToCalls).not.toHaveBeenCalled();
      expect(push.sendToTenant).not.toHaveBeenCalled();
      expect(nativePush.sendToTenantModule).not.toHaveBeenCalled();
    });

    it('sin respuesta al vencer el tiempo de espera queda perdida y deja de sonar', async () => {
      jest.useFakeTimers();
      const ringing = callDoc();
      callModel.create.mockResolvedValue(ringing);
      await service.onIncoming(ACCOUNT as never, ev);
      callModel.findOne.mockReturnValue(q(ringing));
      callModel.findOneAndUpdate
        .mockReturnValueOnce(
          q({ ...ringing, status: 'missed', endedAt: new Date() }),
        )
        .mockReturnValueOnce(q(null)); // registro: ya registrada
      await jest.advanceTimersByTimeAsync(30_000);
      expect(callModel.findOneAndUpdate.mock.calls[0][1]).toMatchObject({
        $set: { status: 'missed', endReason: 'timeout' },
      });
      expect(gateway.emitToCalls).toHaveBeenCalledWith(
        String(TENANT),
        'call:ended',
        {
          id: String(ringing._id),
          status: 'missed',
        },
      );
      expect(meta.action).toHaveBeenCalledWith(CFG, 'wacid.1', 'reject');
    });
  });

  describe('aceptar', () => {
    it('reserva y entrega la oferta; avisa a los demás', async () => {
      const id = new Types.ObjectId();
      callModel.findOneAndUpdate.mockReturnValue(
        q({ _id: id, offerSdp: 'v=0 offer' }),
      );
      const res = await service.claim(
        String(id),
        String(TENANT),
        String(new Types.ObjectId()),
      );
      expect(res).toEqual({ offerSdp: 'v=0 offer' });
      expect(callModel.findOneAndUpdate.mock.calls[0][0]).toMatchObject({
        status: 'ringing',
        direction: 'inbound',
      });
      expect(gateway.emitToCalls).toHaveBeenCalledWith(
        String(TENANT),
        'call:taken',
        expect.objectContaining({ id: String(id) }),
      );
    });

    it('un segundo intento responde 409 "ya fue atendida"', async () => {
      const call = callDoc({ status: 'connecting' });
      callModel.findOneAndUpdate.mockReturnValue(q(null));
      callModel.findOne.mockReturnValue(q(call));
      await expect(
        service.claim(
          String(call._id),
          String(TENANT),
          String(new Types.ObjectId()),
        ),
      ).rejects.toThrow(new ConflictException('Esta llamada ya fue atendida'));
    });

    it('envía pre_accept y accept con la respuesta SDP y la deja activa', async () => {
      const user = new Types.ObjectId();
      const call = callDoc({ status: 'connecting', claimedBy: user });
      callModel.findOne.mockReturnValue(q(call));
      callModel.findOneAndUpdate.mockReturnValue(
        q({ ...call, status: 'active', answeredByName: 'Ana' }),
      );
      const res = await service.accept(
        String(call._id),
        String(TENANT),
        String(user),
        'v=0 answer',
      );
      expect(meta.action).toHaveBeenNthCalledWith(
        1,
        CFG,
        'wacid.1',
        'pre_accept',
        'v=0 answer',
      );
      expect(meta.action).toHaveBeenNthCalledWith(
        2,
        CFG,
        'wacid.1',
        'accept',
        'v=0 answer',
      );
      expect(callModel.findOneAndUpdate.mock.calls[0][1]).toMatchObject({
        $set: { status: 'active', answeredByName: 'Ana' },
        $unset: { offerSdp: 1 },
      });
      expect(res.status).toBe('active');
    });

    it('nadie más que quien reservó puede aceptar', async () => {
      const call = callDoc({
        status: 'connecting',
        claimedBy: new Types.ObjectId(),
      });
      callModel.findOne.mockReturnValue(q(call));
      await expect(
        service.accept(
          String(call._id),
          String(TENANT),
          String(new Types.ObjectId()),
          'sdp',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(meta.action).not.toHaveBeenCalled();
    });

    it('si el micrófono falla, liberar devuelve la llamada a todos', async () => {
      const call = callDoc();
      callModel.findOneAndUpdate.mockReturnValue(q(call));
      await service.release(
        String(call._id),
        String(TENANT),
        String(new Types.ObjectId()),
      );
      expect(callModel.findOneAndUpdate.mock.calls[0][1]).toMatchObject({
        $set: { status: 'ringing' },
      });
      expect(gateway.emitToCalls).toHaveBeenCalledWith(
        String(TENANT),
        'call:incoming',
        expect.anything(),
      );
    });
  });

  describe('fin y registro', () => {
    it('terminate de una activa la completa con la duración de Meta y la registra una vez', async () => {
      const user = new Types.ObjectId();
      const active = callDoc({
        status: 'active',
        claimedBy: user,
        answeredBy: user,
        answeredByName: 'Ana',
        connectedAt: new Date(),
      });
      callModel.findOne.mockReturnValue(q(active));
      const ended = {
        ...active,
        status: 'completed',
        durationSec: 192,
        endedAt: new Date(),
      };
      callModel.findOneAndUpdate
        .mockReturnValueOnce(q(ended))
        .mockReturnValueOnce(q(ended));
      await service.onTerminate('wacid.1', {
        status: 'COMPLETED',
        duration: 192,
      });
      expect(callModel.findOneAndUpdate.mock.calls[0][1]).toMatchObject({
        $set: { status: 'completed', durationSec: 192 },
      });
      expect(conversations.noteCall).toHaveBeenCalledWith(
        String(TENANT),
        String(ACCOUNT._id),
        '51987654321',
        undefined,
        'Llamada entrante · 3 min 12 s · atendió Ana',
      );
      expect(activityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'call',
          title: 'Llamada entrante · 3 min 12 s · atendió Ana',
          fromUserId: user,
        }),
      );
      expect(gateway.emitToUser).toHaveBeenCalledWith(
        String(user),
        'call:ended',
        expect.anything(),
      );
    });

    it('si ya estaba registrada (webhook repetido) no duplica ficha ni chat', async () => {
      const active = callDoc({ status: 'active', connectedAt: new Date() });
      callModel.findOne.mockReturnValue(q(active));
      callModel.findOneAndUpdate
        .mockReturnValueOnce(q({ ...active, status: 'completed' }))
        .mockReturnValueOnce(q(null));
      await service.onTerminate('wacid.1', {});
      expect(conversations.noteCall).not.toHaveBeenCalled();
      expect(activityModel.create).not.toHaveBeenCalled();
    });

    it('una terminada no cambia con otro terminate', async () => {
      callModel.findOne.mockReturnValue(q(callDoc({ status: 'completed' })));
      await service.onTerminate('wacid.1', {});
      expect(callModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('perdida con respuesta automática: envía el mensaje una sola vez', async () => {
      accounts.findById.mockResolvedValue({
        ...ACCOUNT,
        calling: {
          ringTimeoutSec: 30,
          missedReplyEnabled: true,
          missedReplyText: 'Te llamamos enseguida',
        },
      });
      const ringing = callDoc();
      callModel.findOne.mockReturnValue(q(ringing));
      const missed = { ...ringing, status: 'missed', endedAt: new Date() };
      callModel.findOneAndUpdate
        .mockReturnValueOnce(q(missed))
        .mockReturnValueOnce(q(missed));
      await service.onTerminate('wacid.1', {});
      expect(conversations.sendAutomatic).toHaveBeenCalledWith(
        expect.anything(),
        'Te llamamos enseguida',
      );

      callModel.updateOne.mockReturnValue(q({ modifiedCount: 0 }));
      callModel.findOneAndUpdate
        .mockReturnValueOnce(q(missed))
        .mockReturnValueOnce(q(missed));
      conversations.sendAutomatic.mockClear();
      await service.onTerminate('wacid.1', {});
      expect(conversations.sendAutomatic).not.toHaveBeenCalled();
    });

    it('un contacto sin teléfono (BSUID) va al chat pero no crea cliente', async () => {
      const active = callDoc({
        status: 'active',
        contact: 'PE.1502576394655843',
        connectedAt: new Date(),
      });
      callModel.findOne.mockReturnValue(q(active));
      callModel.findOneAndUpdate
        .mockReturnValueOnce(q({ ...active, status: 'completed' }))
        .mockReturnValueOnce(q({ ...active, status: 'completed' }));
      await service.onTerminate('wacid.1', {});
      expect(conversations.noteCall).toHaveBeenCalled();
      expect(leads.upsertCustomer).not.toHaveBeenCalled();
    });
  });

  describe('permiso de llamada y salientes', () => {
    const can = (request: boolean, call: boolean) => [
      {
        action_name: 'send_call_permission_request',
        can_perform_action: request,
      },
      { action_name: 'start_call', can_perform_action: call },
    ];

    it('permiso temporal vigente: concedido con su vencimiento y se puede llamar', async () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      meta.permission.mockResolvedValue({
        permission: { status: 'temporary', expiration_time: exp },
        actions: can(false, true),
      });
      const res = await service.permissionState(
        String(TENANT),
        String(ACCOUNT._id),
        '51987654321',
      );
      expect(res).toEqual({
        status: 'granted',
        expiresAt: new Date(exp * 1000).toISOString(),
        canRequest: false,
        canCall: true,
      });
    });

    it('solicitud enviada sin respuesta: pendiente; rechazada: rechazado', async () => {
      meta.permission.mockResolvedValue({
        permission: { status: 'no_permission' },
        actions: can(false, false),
      });
      permModel.findOne.mockReturnValueOnce(q({ requestedAt: new Date() }));
      expect(
        (
          await service.permissionState(
            String(TENANT),
            String(ACCOUNT._id),
            '51987654321',
          )
        ).status,
      ).toBe('pending');
      permModel.findOne.mockReturnValueOnce(
        q({
          requestedAt: new Date(Date.now() - 1000),
          response: 'reject',
          respondedAt: new Date(),
        }),
      );
      expect(
        (
          await service.permissionState(
            String(TENANT),
            String(ACCOUNT._id),
            '51987654321',
          )
        ).status,
      ).toBe('rejected');
    });

    it('sin cupo para pedir permiso responde 400 y no envía nada', async () => {
      meta.permission.mockResolvedValue({
        permission: { status: 'no_permission' },
        actions: can(false, false),
      });
      await expect(
        service.requestPermission(
          String(TENANT),
          String(new Types.ObjectId()),
          String(ACCOUNT._id),
          '51987654321',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(meta.requestPermission).not.toHaveBeenCalled();
    });

    it('pedir permiso envía el mensaje interactivo y queda pendiente', async () => {
      meta.permission.mockResolvedValue({
        permission: { status: 'no_permission' },
        actions: can(true, false),
      });
      const res = await service.requestPermission(
        String(TENANT),
        String(new Types.ObjectId()),
        String(ACCOUNT._id),
        '51987654321',
      );
      expect(meta.requestPermission).toHaveBeenCalledWith(
        CFG,
        '51987654321',
        expect.any(String),
      );
      expect(res.status).toBe('pending');
    });

    it('otra empresa no puede usar la cuenta', async () => {
      await expect(
        service.permissionState(
          String(new Types.ObjectId()),
          String(ACCOUNT._id),
          '51987654321',
        ),
      ).rejects.toThrow('Cuenta de WhatsApp no encontrada');
    });

    it('la saliente envía connect y la respuesta SDP llega solo a quien llama', async () => {
      const user = new Types.ObjectId();
      const res = await service.startOutbound(
        String(TENANT),
        String(user),
        String(ACCOUNT._id),
        '51987654321',
        'v=0 offer',
      );
      expect(meta.connect).toHaveBeenCalledWith(
        CFG,
        '51987654321',
        'v=0 offer',
        expect.any(String),
      );
      expect(res).toMatchObject({ direction: 'outbound', status: 'ringing' });

      callModel.findOne.mockReturnValue(
        q(
          callDoc({
            direction: 'outbound',
            claimedBy: user,
            waCallId: 'wacid.out',
          }),
        ),
      );
      await service.onOutboundAnswer('wacid.out', 'v=0 answer');
      expect(gateway.emitToUser).toHaveBeenCalledWith(
        String(user),
        'call:answer',
        expect.objectContaining({ sdp: 'v=0 answer' }),
      );
      expect(gateway.emitToCalls).not.toHaveBeenCalledWith(
        expect.anything(),
        'call:answer',
        expect.anything(),
      );
    });

    it('no deja llamar a un contacto bloqueado', async () => {
      blocks.isBlocked.mockResolvedValue(true);
      await expect(
        service.startOutbound(
          String(TENANT),
          String(new Types.ObjectId()),
          String(ACCOUNT._id),
          '51987654321',
          'sdp',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(meta.connect).not.toHaveBeenCalled();
    });
  });
});
