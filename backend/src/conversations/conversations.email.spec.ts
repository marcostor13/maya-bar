import { Types } from 'mongoose';
import { ConversationsService } from './conversations.service';
import type { ParsedEmail } from '../email-accounts/email-message';

type Doc = Record<string, any> & { _id: Types.ObjectId; save: jest.Mock };

/**
 * Arnés en memoria: conversaciones y mensajes viven en arrays, así se
 * ejercita el flujo real de ingesta y envío sin Mongo.
 */
function setup(
  opts: { agent?: boolean; reply?: string; sendFails?: boolean } = {},
) {
  const convs: Doc[] = [];
  const msgs: Doc[] = [];
  const withSave = <T extends Record<string, any>>(d: T): Doc =>
    Object.assign(d, {
      save: jest.fn().mockResolvedValue(undefined),
    }) as unknown as Doc;
  const chain = (result: () => unknown) => {
    const q: any = {};
    for (const m of ['sort', 'select', 'limit', 'lean']) q[m] = () => q;
    q.exec = () => Promise.resolve(result());
    return q;
  };

  const convModel = {
    findOne: jest.fn((f: any) =>
      chain(
        () =>
          convs.find(
            (c) =>
              (!f._id || String(c._id) === String(f._id)) &&
              (!f.channel || c.channel === f.channel) &&
              (!f.contact || c.contact === f.contact) &&
              (!f.accountId || String(c.accountId) === String(f.accountId)),
          ) ?? null,
      ),
    ),
    create: jest.fn((d: any) => {
      const doc = withSave({ _id: new Types.ObjectId(), ...d });
      convs.push(doc);
      return Promise.resolve(doc);
    }),
  };
  const msgModel = {
    create: jest.fn((d: any) => {
      const doc = withSave({ _id: new Types.ObjectId(), ...d });
      msgs.push(doc);
      return Promise.resolve(doc);
    }),
    countDocuments: jest.fn((f: any) =>
      chain(
        () =>
          msgs.filter(
            (m) =>
              String(m.conversationId) === String(f.conversationId) &&
              m.author === f.author,
          ).length,
      ),
    ),
    exists: jest.fn((f: any) =>
      Promise.resolve(
        msgs.some((m) => m.externalId === f.externalId) ? { _id: 1 } : null,
      ),
    ),
    find: jest.fn((f: any) =>
      chain(() =>
        msgs
          .filter(
            (m) =>
              String(m.conversationId) === String(f.conversationId) &&
              m._id !== f._id?.$ne,
          )
          .reverse(),
      ),
    ),
    findOne: jest.fn((f: any) =>
      chain(
        () =>
          [...msgs]
            .reverse()
            .find(
              (m) =>
                String(m.conversationId) === String(f.conversationId) &&
                m.direction === f.direction &&
                !!m.externalId,
            ) ?? null,
      ),
    ),
  };

  const tenantId = new Types.ObjectId();
  const account = {
    _id: new Types.ObjectId(),
    tenantId,
    email: 'ventas@acme.pe',
    label: 'Ventas',
    fromName: 'Acme Ventas',
    signature: 'Equipo Acme',
    active: true,
    skipBulk: true,
  };
  const emailAccounts = {
    findById: jest.fn().mockResolvedValue(account),
    findOne: jest.fn().mockResolvedValue(account),
    smtpConfig: jest.fn().mockResolvedValue({ host: 'smtp.acme.pe' }),
    fromHeader: jest.fn().mockReturnValue('"Acme Ventas" <ventas@acme.pe>'),
  };
  const emailTransport = {
    send: opts.sendFails
      ? jest.fn().mockRejectedValue(new Error('SMTP caído'))
      : jest.fn().mockResolvedValue('<out-1@acme.pe>'),
  };
  const agent = { _id: new Types.ObjectId(), handoffMessage: '' };
  const agents = {
    findPublishedByEmailAccount: jest
      .fn()
      .mockResolvedValue(opts.agent === false ? null : agent),
    generateAnswer: jest.fn().mockResolvedValue({
      reply: opts.reply ?? 'Hola Ana, claro que sí.',
      filesToSend: [],
      handoff: null,
    }),
    getTenantApiKeys: jest.fn().mockResolvedValue({}),
  };
  const gateway = {
    emitMessage: jest.fn(),
    emitMessageUpdated: jest.fn(),
    emitConversation: jest.fn(),
    emitTyping: jest.fn(),
  };
  const push = { sendToTenant: jest.fn().mockResolvedValue(1) };
  const nativePush = { sendToTenantModule: jest.fn().mockResolvedValue(1) };
  const uploads = {
    uploadBuffer: jest.fn(
      (_b: Buffer, type: string, _f: string, name: string) =>
        Promise.resolve({
          url: `https://cdn/${name}`,
          key: name,
          contentType: type,
          size: 10,
        }),
    ),
  };
  const media = {
    interpret: jest.fn().mockResolvedValue({ text: 'Factura de 100 soles' }),
  };
  const suppression = { isSuppressed: jest.fn().mockResolvedValue(false) };

  const service = new ConversationsService(
    convModel as never,
    msgModel as never,
    {} as never, // wa
    {} as never, // ig
    {} as never, // ms
    {} as never, // waAccounts
    {} as never, // igAccounts
    {} as never, // msAccounts
    agents as never,
    media as never,
    uploads as never,
    gateway as never,
    {} as never, // handoff
    { findCustomer: jest.fn() } as never, // leads
    push as never,
    nativePush as never,
    suppression as never,
    emailAccounts as never,
    emailTransport as never,
  );
  return {
    service,
    convs,
    msgs,
    account,
    agents,
    emailTransport,
    push,
    uploads,
    media,
    suppression,
  };
}

function email(extra: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    messageId: '<in-1@cliente.pe>',
    references: ['<first@acme.pe>'],
    from: 'ana@cliente.pe',
    fromName: 'Ana Ruiz',
    to: ['ventas@acme.pe'],
    subject: 'Cotización web',
    text: '¿Cuánto cuesta una web?',
    date: new Date('2026-09-22T10:00:00Z'),
    bulk: false,
    automated: false,
    attachments: [],
    ...extra,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ConversationsService — correo', () => {
  it('crea la conversación, avisa al equipo y el agente responde por correo en el mismo hilo', async () => {
    const h = setup();
    await expect(
      h.service.handleEmailInbound(h.account as never, email()),
    ).resolves.toBe('ingested');
    await flush();

    expect(h.convs).toHaveLength(1);
    expect(h.convs[0]).toMatchObject({
      channel: 'email',
      contact: 'ana@cliente.pe',
      contactName: 'Ana Ruiz',
      emailSubject: 'Re: Cotización web',
    });
    const [inbound, reply] = h.msgs;
    expect(inbound).toMatchObject({
      direction: 'in',
      subject: 'Cotización web',
      externalId: '<in-1@cliente.pe>',
      emailReferences: ['<first@acme.pe>'],
    });
    expect(h.push.sendToTenant).toHaveBeenCalled();

    // El agente sabe que es un correo y ve el asunto.
    const [, userMessage, , options] = h.agents.generateAnswer.mock.calls[0];
    expect(userMessage).toBe(
      'Asunto: Cotización web\n\n¿Cuánto cuesta una web?',
    );
    expect(options.channelHint).toContain('CORREO ELECTRÓNICO');

    expect(h.emailTransport.send).toHaveBeenCalledWith(
      { host: 'smtp.acme.pe' },
      expect.objectContaining({
        from: '"Acme Ventas" <ventas@acme.pe>',
        to: 'ana@cliente.pe',
        subject: 'Re: Cotización web',
        inReplyTo: '<in-1@cliente.pe>',
        references: ['<first@acme.pe>', '<in-1@cliente.pe>'],
        text: 'Hola Ana, claro que sí.\n\n--\nEquipo Acme',
        headers: { 'Auto-Submitted': 'auto-replied' },
      }),
    );
    expect(reply).toMatchObject({
      direction: 'out',
      author: 'agent',
      status: 'sent',
      externalId: '<out-1@acme.pe>',
      subject: 'Re: Cotización web',
    });
  });

  it('no procesa dos veces el mismo correo ni los propios', async () => {
    const h = setup();
    await h.service.handleEmailInbound(h.account as never, email());
    await flush();
    const before = h.msgs.length;
    await expect(
      h.service.handleEmailInbound(h.account as never, email()),
    ).resolves.toBe('skipped');
    await expect(
      h.service.handleEmailInbound(
        h.account as never,
        email({ from: 'ventas@acme.pe', messageId: '<x>' }),
      ),
    ).resolves.toBe('skipped');
    expect(h.msgs.length).toBe(before);
  });

  it('ignora boletines si el buzón lo pide', async () => {
    const h = setup();
    await expect(
      h.service.handleEmailInbound(h.account as never, email({ bulk: true })),
    ).resolves.toBe('skipped');
    expect(h.msgs).toHaveLength(0);
  });

  it('archiva una respuesta automática sin que el agente conteste', async () => {
    const h = setup();
    await h.service.handleEmailInbound(
      h.account as never,
      email({ automated: true, subject: 'Fuera de la oficina' }),
    );
    await flush();
    expect(h.msgs).toHaveLength(1);
    expect(h.push.sendToTenant).toHaveBeenCalled();
    expect(h.agents.generateAnswer).not.toHaveBeenCalled();
    expect(h.emailTransport.send).not.toHaveBeenCalled();
  });

  it('ingresa los adjuntos en silencio, los interpreta y el agente responde una sola vez', async () => {
    const h = setup();
    await h.service.handleEmailInbound(
      h.account as never,
      email({
        text: '',
        attachments: [
          {
            filename: 'factura.pdf',
            contentType: 'application/pdf',
            content: Buffer.from('%PDF'),
            size: 4,
          },
        ],
      }),
    );
    await flush();
    const [file, body] = h.msgs;
    expect(file).toMatchObject({
      type: 'document',
      mediaUrl: 'https://cdn/factura.pdf',
      filename: 'factura.pdf',
      transcript: 'Factura de 100 soles',
    });
    expect(h.uploads.uploadBuffer).toHaveBeenCalledWith(
      Buffer.from('%PDF'),
      'application/pdf',
      'email-media',
      'factura.pdf',
    );
    expect(body).toMatchObject({
      type: 'text',
      text: '(Correo con 1 adjunto)',
    });
    // Un aviso por correo, no uno por adjunto.
    expect(h.push.sendToTenant).toHaveBeenCalledTimes(1);
    expect(h.agents.generateAnswer).toHaveBeenCalledTimes(1);
    // El agente ve el contenido del adjunto en el historial.
    const history = h.agents.generateAnswer.mock.calls[0][2];
    expect(JSON.stringify(history)).toContain('Factura de 100 soles');
  });

  it('respeta la lista de no contactar', async () => {
    const h = setup();
    h.suppression.isSuppressed.mockResolvedValue(true);
    await h.service.handleEmailInbound(h.account as never, email());
    await flush();
    expect(h.suppression.isSuppressed).toHaveBeenCalledWith(
      String(h.account.tenantId),
      {
        phone: undefined,
        email: 'ana@cliente.pe',
      },
    );
    expect(h.emailTransport.send).not.toHaveBeenCalled();
  });

  it('un fallo de SMTP deja el mensaje como fallido sin romper la recepción', async () => {
    const h = setup({ sendFails: true });
    await h.service.handleEmailInbound(h.account as never, email());
    await flush();
    const reply = h.msgs[1];
    expect(reply.status).toBe('failed');
    expect(reply.error).toContain('SMTP caído');
  });

  it('redacta un correo nuevo: crea la conversación en manual y lo envía con su asunto', async () => {
    const h = setup();
    const userId = new Types.ObjectId().toString();
    const msg = await h.service.composeEmail(
      String(h.account.tenantId),
      userId,
      {
        accountId: String(h.account._id),
        to: 'Nuevo@Cliente.PE',
        subject: 'Propuesta para su web',
        text: 'Hola, le escribo porque…',
      },
    );
    expect(h.convs[0]).toMatchObject({
      channel: 'email',
      contact: 'nuevo@cliente.pe',
      autoReply: false,
      emailSubject: 'Propuesta para su web',
    });
    expect(h.emailTransport.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        to: 'nuevo@cliente.pe',
        subject: 'Propuesta para su web',
        inReplyTo: undefined,
      }),
    );
    expect(msg).toMatchObject({
      author: 'human',
      status: 'sent',
      subject: 'Propuesta para su web',
    });
  });

  it('una respuesta manual con asunto propio lo usa y actualiza el hilo', async () => {
    const h = setup({ agent: false });
    await h.service.handleEmailInbound(h.account as never, email());
    await flush();
    const conv = h.convs[0];
    await h.service.sendManual(
      String(conv._id),
      String(h.account.tenantId),
      new Types.ObjectId().toString(),
      {
        text: 'Le adjunto la propuesta',
        subject: 'Propuesta final',
      },
    );
    expect(h.emailTransport.send).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        subject: 'Propuesta final',
        inReplyTo: '<in-1@cliente.pe>',
      }),
    );
    expect(conv.emailSubject).toBe('Propuesta final');
    expect(conv.autoReply).toBe(false);
  });

  it('pausa al agente si responde demasiados correos seguidos (posible bucle)', async () => {
    const h = setup();
    for (let i = 0; i < 7; i++) {
      await h.service.handleEmailInbound(
        h.account as never,
        email({ messageId: `<loop-${i}@robot.pe>`, from: 'robot@robot.pe' }),
      );
      await flush();
    }
    expect(h.emailTransport.send).toHaveBeenCalledTimes(5);
    const conv = h.convs[0];
    expect(conv.autoReply).toBe(false);
    expect(
      h.msgs.some((m) => m.author === 'system' && /bucle/.test(m.text)),
    ).toBe(true);
  });

  it('las respuestas manuales no llevan la marca de respuesta automática', async () => {
    const h = setup({ agent: false });
    await h.service.handleEmailInbound(h.account as never, email());
    await flush();
    await h.service.sendManual(
      String(h.convs[0]._id),
      String(h.account.tenantId),
      new Types.ObjectId().toString(),
      { text: 'Hola' },
    );
    expect(h.emailTransport.send.mock.calls[0][1].headers).toBeUndefined();
  });
});
