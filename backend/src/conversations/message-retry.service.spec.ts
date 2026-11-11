import { Types } from 'mongoose';
import { MessageRetryService } from './message-retry.service';

const NOW = new Date('2026-11-11T15:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const query = (result: unknown) => {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'limit', 'select', 'lean'])
    q[m] = jest.fn().mockReturnValue(q);
  q.exec = jest.fn().mockResolvedValue(result);
  return q;
};

interface FakeMsg {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  conversationId: Types.ObjectId;
  at: Date;
  status: string;
  error?: string;
  retryAt?: Date;
  retryCount?: number;
  retryStopped?: boolean;
  externalId?: string;
  save: jest.Mock;
}

function failedMsg(over: Partial<FakeMsg> = {}): FakeMsg {
  return {
    _id: new Types.ObjectId(),
    tenantId: new Types.ObjectId(),
    conversationId: new Types.ObjectId(),
    at: minutesAgo(30),
    status: 'failed',
    error: '#131042 Business eligibility payment issue — currency',
    save: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

interface Setup {
  candidates: FakeMsg[];
  /** Conversación por id; `null` = no existe o en papelera. */
  conv?: (id: string) => Record<string, unknown> | null;
  /** ¿Hay un saliente posterior en esta conversación? */
  later?: (convId: string) => boolean;
  /** Minutos desde el último entrante. */
  lastInMinutes?: number;
  /** Lo que devuelve el reclamo atómico; por defecto el propio mensaje. */
  claim?: (msg: FakeMsg) => FakeMsg | null;
  redeliver?: jest.Mock;
}

function build(s: Setup) {
  const accountId = new Types.ObjectId();
  const byId = new Map(s.candidates.map((m) => [String(m._id), m]));
  const msgModel = {
    find: jest.fn().mockReturnValue(query(s.candidates)),
    exists: jest.fn((f: { conversationId: Types.ObjectId }) =>
      query(s.later?.(String(f.conversationId)) ? { _id: 'x' } : null),
    ),
    findOne: jest.fn(() => query({ at: minutesAgo(s.lastInMinutes ?? 40) })),
    updateOne: jest.fn(() => query({ modifiedCount: 1 })),
    findOneAndUpdate: jest.fn((f: { _id: Types.ObjectId }) => {
      const msg = byId.get(String(f._id))!;
      return query(s.claim ? s.claim(msg) : msg);
    }),
  };
  const convModel = {
    findById: jest.fn((id: Types.ObjectId) =>
      query(
        s.conv
          ? s.conv(String(id))
          : { _id: id, channel: 'whatsapp', blocked: false, accountId },
      ),
    ),
  };
  const conversations = {
    redeliver: s.redeliver ?? jest.fn().mockResolvedValue('wamid.NEW'),
  };
  const gateway = { emitMessageUpdated: jest.fn() };
  const service = new MessageRetryService(
    msgModel as never,
    convModel as never,
    conversations as never,
    gateway as never,
  );
  return { service, msgModel, convModel, conversations, gateway };
}

/** ¿Se marcó este mensaje como descartado? */
const stoppedIds = (msgModel: { updateOne: jest.Mock }) =>
  (
    msgModel.updateOne.mock.calls as [
      { _id: Types.ObjectId },
      { $set: Record<string, unknown> },
    ][]
  )
    .filter(([, u]) => u.$set.retryStopped === true)
    .map(([f]) => String(f._id));

describe('MessageRetryService', () => {
  const env = process.env.WA_AUTO_RETRY;
  afterEach(() => {
    if (env === undefined) delete process.env.WA_AUTO_RETRY;
    else process.env.WA_AUTO_RETRY = env;
  });

  it('busca solo salientes fallidos de agente u operador dentro de 24 h', async () => {
    const { service, msgModel } = build({ candidates: [] });
    await service.tick(NOW);
    const filter = (
      msgModel.find.mock.calls[0] as [Record<string, unknown>]
    )[0];
    expect(filter).toMatchObject({
      status: 'failed',
      direction: 'out',
      author: { $in: ['agent', 'human'] },
      inTrash: { $ne: true },
      retryStopped: { $ne: true },
      at: { $gt: new Date(NOW.getTime() - 24 * 3600_000) },
    });
  });

  it('C3: reenvía el fallido, lo deja enviado con el nuevo id y avisa a la bandeja', async () => {
    const msg = failedMsg();
    const { service, conversations, gateway } = build({ candidates: [msg] });
    await service.tick(NOW);

    expect(conversations.redeliver).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'whatsapp' }),
      msg,
    );
    expect(msg.status).toBe('sent');
    expect(msg.externalId).toBe('wamid.NEW');
    expect(msg.error).toBeUndefined();
    expect(msg.retryCount).toBe(1);
    // Si Meta lo rechaza luego por el webhook, no se reintenta al minuto.
    expect(msg.retryAt).toEqual(new Date(NOW.getTime() + 5 * 60_000));
    expect(msg.save).toHaveBeenCalled();
    expect(gateway.emitMessageUpdated).toHaveBeenCalledWith(
      String(msg.tenantId),
      msg,
    );
  });

  it('C4: con dos fallidos en la conversación, solo reenvía el último', async () => {
    const conversationId = new Types.ObjectId();
    const older = failedMsg({ conversationId, at: minutesAgo(40) });
    const newer = failedMsg({ conversationId, at: minutesAgo(30) });
    const { service, conversations, msgModel } = build({
      candidates: [older, newer],
      // El anterior tiene un saliente después (el más reciente); este no.
      later: () => msgModel.exists.mock.calls.length === 1,
    });
    await service.tick(NOW);

    expect(conversations.redeliver).toHaveBeenCalledTimes(1);
    expect(conversations.redeliver).toHaveBeenCalledWith(
      expect.anything(),
      newer,
    );
    expect(stoppedIds(msgModel)).toEqual([String(older._id)]);
  });

  it('C5: si después salió otro mensaje, no lo reenvía y lo descarta', async () => {
    const msg = failedMsg();
    const { service, conversations, msgModel } = build({
      candidates: [msg],
      later: () => true,
    });
    await service.tick(NOW);
    expect(conversations.redeliver).not.toHaveBeenCalled();
    expect(stoppedIds(msgModel)).toEqual([String(msg._id)]);
  });

  it('C5: las notas internas posteriores (derivación, llamadas) no cuentan como respuesta', async () => {
    const msg = failedMsg();
    const { service, msgModel } = build({ candidates: [msg] });
    await service.tick(NOW);
    expect(msgModel.exists).toHaveBeenCalledWith({
      conversationId: msg.conversationId,
      direction: 'out',
      author: { $in: ['agent', 'human'] },
      inTrash: { $ne: true },
      at: { $gt: msg.at },
    });
  });

  it('el descarte no pisa un mensaje que otra instancia reclamó', async () => {
    const msg = failedMsg({ error: '#131047 x', retryAt: minutesAgo(1) });
    const { service, msgModel } = build({ candidates: [msg] });
    await service.tick(NOW);
    expect(msgModel.updateOne).toHaveBeenCalledWith(
      { _id: msg._id, status: 'failed', retryAt: msg.retryAt },
      { $set: { retryStopped: true } },
    );
  });

  it('C6: con la ventana de 24 h cerrada, no lo reenvía y lo descarta', async () => {
    const msg = failedMsg();
    const { service, conversations, msgModel } = build({
      candidates: [msg],
      lastInMinutes: 25 * 60,
    });
    await service.tick(NOW);
    expect(conversations.redeliver).not.toHaveBeenCalled();
    expect(stoppedIds(msgModel)).toEqual([String(msg._id)]);
  });

  it('C7: un error que no es temporal no se reintenta', async () => {
    const msg = failedMsg({ error: '#131047 Re-engagement message' });
    const { service, conversations, msgModel, convModel } = build({
      candidates: [msg],
    });
    await service.tick(NOW);
    expect(conversations.redeliver).not.toHaveBeenCalled();
    expect(convModel.findById).not.toHaveBeenCalled();
    expect(stoppedIds(msgModel)).toEqual([String(msg._id)]);
  });

  it('C8: si vuelve a fallar por algo temporal, programa el siguiente intento', async () => {
    const msg = failedMsg({ retryCount: 2, retryAt: minutesAgo(1) });
    const { service, gateway } = build({
      candidates: [msg],
      redeliver: jest
        .fn()
        .mockRejectedValue(new Error('CloudAPI 400 #131042: payment issue')),
    });
    await service.tick(NOW);

    expect(msg.status).toBe('failed');
    expect(msg.error).toContain('#131042');
    expect(msg.retryCount).toBe(3);
    expect(msg.retryAt).toEqual(new Date(NOW.getTime() + 20 * 60_000));
    expect(msg.retryStopped).toBeUndefined();
    expect(gateway.emitMessageUpdated).toHaveBeenCalled();
  });

  it('si el reintento falla por algo definitivo, deja de intentarlo', async () => {
    const msg = failedMsg();
    const { service } = build({
      candidates: [msg],
      redeliver: jest
        .fn()
        .mockRejectedValue(new Error('CloudAPI 400 #131026: undeliverable')),
    });
    await service.tick(NOW);
    expect(msg.retryStopped).toBe(true);
  });

  it('C9: si una cuenta falla, aplaza sus demás mensajes en esa pasada', async () => {
    const a = failedMsg();
    const b = failedMsg();
    const redeliver = jest
      .fn()
      .mockRejectedValue(new Error('CloudAPI 400 #131042: payment issue'));
    const { service, msgModel } = build({ candidates: [a, b], redeliver });
    await service.tick(NOW);

    expect(redeliver).toHaveBeenCalledTimes(1);
    expect(msgModel.updateOne).toHaveBeenCalledWith(
      { _id: b._id, status: 'failed', retryAt: null },
      { $set: { retryAt: a.retryAt } },
    );
  });

  it.each([
    ['bloqueada', () => ({ channel: 'whatsapp', blocked: true })],
    ['en papelera', () => null],
    ['de otro canal', () => ({ channel: 'messenger', blocked: false })],
  ])('C10: conversación %s → no se reenvía', async (_name, conv) => {
    const msg = failedMsg();
    const { service, conversations, msgModel } = build({
      candidates: [msg],
      conv,
    });
    await service.tick(NOW);
    expect(conversations.redeliver).not.toHaveBeenCalled();
    expect(stoppedIds(msgModel)).toEqual([String(msg._id)]);
  });

  it('C11: si otra instancia ya lo reclamó, no lo envía', async () => {
    const msg = failedMsg();
    const { service, conversations, msgModel } = build({
      candidates: [msg],
      claim: () => null,
    });
    await service.tick(NOW);
    expect(msgModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: msg._id, status: 'failed', retryAt: null },
      { $set: { retryAt: new Date(NOW.getTime() + 10 * 60_000) } },
      { new: true },
    );
    expect(conversations.redeliver).not.toHaveBeenCalled();
  });

  it('C12: con WA_AUTO_RETRY=false no hace nada', async () => {
    process.env.WA_AUTO_RETRY = 'false';
    const { service, msgModel } = build({ candidates: [failedMsg()] });
    await service.tick(NOW);
    expect(msgModel.find).not.toHaveBeenCalled();
  });
});
