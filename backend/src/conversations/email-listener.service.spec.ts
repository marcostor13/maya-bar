import { EventEmitter } from 'node:events';
import { Subject } from 'rxjs';
import { Types } from 'mongoose';
import { EmailListenerService } from './email-listener.service';

const raw = (subject: string) =>
  Buffer.from(
    `From: ana@cliente.pe\r\nSubject: ${subject}\r\nMessage-ID: <${subject}@x>\r\n\r\nHola`,
  );

/** mailparser trabaja con streams: hay que dejar correr varios ciclos. */
const flush = () => new Promise((r) => setTimeout(r, 60));

function account(extra: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    email: 'ventas@acme.pe',
    incomingProtocol: 'imap',
    incomingHost: 'imap.acme.pe',
    active: true,
    ...extra,
  };
}

function setup(
  accounts: ReturnType<typeof account>[],
  opts: { lease?: boolean } = {},
) {
  const changes = new Subject<{ accountId: string; removed?: boolean }>();
  const imap = Object.assign(new EventEmitter(), {
    connect: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
  });
  const accountsSvc = {
    changes,
    findActive: jest.fn().mockResolvedValue(accounts),
    findById: jest.fn((id: string) =>
      Promise.resolve(accounts.find((a) => String(a._id) === id) ?? null),
    ),
    claimLease: jest.fn().mockResolvedValue(opts.lease ?? true),
    releaseLease: jest.fn().mockResolvedValue(undefined),
    incomingConfig: jest.fn().mockResolvedValue({ host: 'imap.acme.pe' }),
    setStatus: jest.fn().mockResolvedValue(undefined),
    saveSync: jest.fn().mockResolvedValue(undefined),
    seenUidls: jest.fn().mockResolvedValue(null),
  };
  const transport = {
    assertHost: jest.fn().mockResolvedValue(undefined),
    createImap: jest.fn(() => imap),
    fetchImapSince: jest
      .fn()
      .mockResolvedValue({ uidValidity: '1', lastUid: 10, messages: [] }),
    fetchPop3New: jest.fn().mockResolvedValue({ uidls: [], messages: [] }),
  };
  const conversations = {
    handleEmailInbound: jest.fn().mockResolvedValue('ingested'),
  };
  const config = { get: () => undefined };
  const listener = new EmailListenerService(
    accountsSvc as never,
    transport as never,
    conversations as never,
    config as never,
  );
  return { listener, accountsSvc, transport, conversations, imap, changes };
}

describe('EmailListenerService', () => {
  it('IMAP: conecta, sincroniza, queda escuchando y procesa lo nuevo cuando el servidor avisa', async () => {
    const a = account({ uidValidity: '1', lastUid: 10 });
    const h = setup([a]);
    await h.listener.sweep();
    await flush();

    expect(h.accountsSvc.claimLease).toHaveBeenCalledWith(
      String(a._id),
      expect.any(String),
      180_000,
    );
    expect(h.imap.connect).toHaveBeenCalled();
    expect(h.transport.fetchImapSince).toHaveBeenCalledWith(h.imap, {
      uidValidity: '1',
      lastUid: 10,
    });
    expect(h.accountsSvc.setStatus).toHaveBeenCalledWith(
      String(a._id),
      'connected',
    );

    // Llega un correo: IDLE emite `exists`.
    h.transport.fetchImapSince.mockResolvedValueOnce({
      uidValidity: '1',
      lastUid: 12,
      messages: [
        { id: '11', raw: raw('uno') },
        { id: '12', raw: raw('dos') },
      ],
    });
    h.imap.emit('exists', { path: 'INBOX', count: 12 });
    await flush();

    expect(h.conversations.handleEmailInbound).toHaveBeenCalledTimes(2);
    const parsed = h.conversations.handleEmailInbound.mock.calls[0][1];
    expect(parsed).toMatchObject({
      from: 'ana@cliente.pe',
      subject: 'uno',
      messageId: '<uno@x>',
    });
    // El avance se guarda correo a correo.
    expect(h.accountsSvc.saveSync).toHaveBeenCalledWith(String(a._id), {
      uidValidity: '1',
      lastUid: 11,
    });
    expect(h.accountsSvc.saveSync).toHaveBeenCalledWith(String(a._id), {
      uidValidity: '1',
      lastUid: 12,
    });

    // En la siguiente ronda no se abre otra conexión.
    await h.listener.sweep();
    await flush();
    expect(h.transport.createImap).toHaveBeenCalledTimes(1);
  });

  it('un correo ilegible no frena el resto', async () => {
    const a = account({ uidValidity: '1', lastUid: 10 });
    const h = setup([a]);
    h.transport.fetchImapSince.mockResolvedValueOnce({
      uidValidity: '1',
      lastUid: 12,
      messages: [
        { id: '11', raw: raw('uno') },
        { id: '12', raw: raw('dos') },
      ],
    });
    h.conversations.handleEmailInbound.mockRejectedValueOnce(
      new Error('Mongo caído'),
    );
    await h.listener.sweep();
    await flush();
    expect(h.conversations.handleEmailInbound).toHaveBeenCalledTimes(2);
    expect(h.accountsSvc.saveSync).toHaveBeenLastCalledWith(String(a._id), {
      uidValidity: '1',
      lastUid: 12,
    });
  });

  it('si la conexión cae, se marca para reconectar en la siguiente ronda', async () => {
    const a = account();
    const h = setup([a]);
    await h.listener.sweep();
    await flush();
    h.imap.emit('close');
    await flush();
    expect(h.accountsSvc.setStatus).toHaveBeenCalledWith(
      String(a._id),
      'connecting',
      'Reconectando…',
    );
    await h.listener.sweep();
    await flush();
    expect(h.transport.createImap).toHaveBeenCalledTimes(2);
  });

  it('un error de conexión se reporta y se reintenta con espera', async () => {
    const a = account();
    const h = setup([a]);
    h.imap.connect.mockRejectedValue(
      Object.assign(new Error('Command failed'), {
        responseText: 'Invalid credentials',
      }),
    );
    await h.listener.sweep();
    await flush();
    expect(h.accountsSvc.setStatus).toHaveBeenCalledWith(
      String(a._id),
      'error',
      expect.stringContaining('credenciales rechazadas'),
    );
    // Dentro de la espera no se vuelve a intentar.
    await h.listener.sweep();
    await flush();
    expect(h.transport.createImap).toHaveBeenCalledTimes(1);
  });

  it('sin arriendo (lo tiene otra réplica) no escucha el buzón', async () => {
    const h = setup([account()], { lease: false });
    await h.listener.sweep();
    await flush();
    expect(h.transport.createImap).not.toHaveBeenCalled();
  });

  it('POP3: la primera vez memoriza, después trae y recuerda lo procesado', async () => {
    const a = account({ incomingProtocol: 'pop3' });
    const h = setup([a]);
    h.transport.fetchPop3New.mockResolvedValueOnce({
      uidls: ['u1', 'u2'],
      messages: [],
    });
    await h.listener.sweep();
    await flush();
    expect(h.transport.fetchPop3New).toHaveBeenCalledWith(
      { host: 'imap.acme.pe' },
      [],
      true,
    );
    expect(h.accountsSvc.saveSync).toHaveBeenCalledWith(String(a._id), {
      seenUidls: ['u1', 'u2'],
    });

    // Dos minutos después: hay uno nuevo.
    h.accountsSvc.seenUidls.mockResolvedValue(['u1', 'u2']);
    h.transport.fetchPop3New.mockResolvedValueOnce({
      uidls: ['u2', 'u3', 'u4'],
      messages: [{ id: 'u3', raw: raw('tres') }],
    });
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 3 * 60_000);
    await h.listener.sweep();
    await flush();
    jest.restoreAllMocks();
    expect(h.conversations.handleEmailInbound).toHaveBeenCalledTimes(1);
    // u4 no se procesó (quedó fuera del tope): no se marca como visto.
    expect(h.accountsSvc.saveSync).toHaveBeenLastCalledWith(String(a._id), {
      seenUidls: ['u2', 'u3'],
    });
  });

  it('al editar o borrar un buzón suelta la conexión y el arriendo', async () => {
    const a = account();
    const h = setup([a]);
    h.listener.onModuleInit();
    await h.listener.sweep();
    await flush();
    h.changes.next({ accountId: String(a._id), removed: true });
    await flush();
    expect(h.imap.logout).toHaveBeenCalled();
    expect(h.accountsSvc.releaseLease).toHaveBeenCalledWith(
      String(a._id),
      expect.any(String),
    );
    await h.listener.onApplicationShutdown();
  });
});
