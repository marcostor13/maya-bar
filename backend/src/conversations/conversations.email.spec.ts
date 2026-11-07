import { Types } from 'mongoose';
import { ConversationsService } from './conversations.service';
import type { ParsedEmail } from '../email-accounts/email-message';

/** Asignación simulada: escribir le da el chat a quien escribe. */
const fakeAssignment = {
  ensureWriter: jest.fn(
    (
      conv: { autoReply: boolean; takenOverBy?: unknown },
      actor: { userId: string },
    ) => {
      conv.autoReply = false;
      conv.takenOverBy = new Types.ObjectId(actor.userId);
      return Promise.resolve(conv);
    },
  ),
  assertCanControl: jest.fn(),
  take: jest.fn(),
  note: jest.fn().mockResolvedValue(undefined),
  nameOf: jest.fn().mockResolvedValue('Ana'),
};

type Doc = Record<string, any> & { _id: Types.ObjectId; save: jest.Mock };

/**
 * Arnés en memoria: conversaciones y mensajes viven en arrays, así se
 * ejercita el flujo real de ingesta y envío sin Mongo.
 */
function setup(
  opts: {
    agent?: boolean;
    reply?: string;
    sendFails?: boolean;
    bookings?: unknown[];
    campaign?: Record<string, unknown> | null;
  } = {},
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
    find: jest.fn((_filter: unknown) => chain(() => [])),
    aggregate: jest.fn(() => ({
      exec: () =>
        Promise.resolve([
          {
            _id: { kind: 'ad', id: '120' },
            name: 'Promo verano',
            count: 4,
            last: new Date(),
          },
        ]),
    })),
    updateMany: jest.fn(() => ({
      exec: () => Promise.resolve({ modifiedCount: 3 }),
    })),
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
  const attribution = {
    lookup: jest.fn().mockResolvedValue(opts.campaign ?? null),
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
              m._id !== f._id?.$ne &&
              (!f.author?.$ne || m.author !== f.author.$ne),
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
  const agent = {
    _id: new Types.ObjectId(),
    name: 'Sofía',
    handoffMessage: '',
    calendar: { enabled: true, timeZone: 'America/Lima' },
  };
  const agents = {
    findPublishedByEmailAccount: jest
      .fn()
      .mockResolvedValue(opts.agent === false ? null : agent),
    generateAnswer: jest.fn().mockResolvedValue({
      reply: opts.reply ?? 'Hola Ana, claro que sí.',
      filesToSend: [],
      handoff: null,
      bookings: opts.bookings ?? [],
    }),
    getTenantApiKeys: jest.fn().mockResolvedValue({}),
  };
  const gateway = {
    emitMessage: jest.fn(),
    emitMessageUpdated: jest.fn(),
    emitConversation: jest.fn(),
    emitTyping: jest.fn(),
  };
  const push = {
    sendToTenant: jest.fn().mockResolvedValue(1),
    sendToUser: jest.fn().mockResolvedValue(1),
  };
  const nativePush = {
    sendToTenantModule: jest.fn().mockResolvedValue(1),
    sendToUser: jest.fn().mockResolvedValue(1),
  };
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
  const suppression = {
    isSuppressed: jest.fn().mockResolvedValue(false),
    setFor: jest.fn().mockResolvedValue({ empty: true }),
  };

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
    fakeAssignment as never,
    attribution as never,
  );
  return {
    service,
    attribution,
    convModel,
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
  beforeEach(() => fakeAssignment.note.mockClear());

  it('atribuye la conversación a la campaña que recibió el contacto', async () => {
    const campaign = {
      kind: 'campaign',
      id: new Types.ObjectId().toString(),
      name: 'Black Friday',
      at: new Date(),
    };
    const h = setup({ campaign });
    await h.service.handleEmailInbound(h.account as never, email());
    await flush();
    expect(h.attribution.lookup).toHaveBeenCalledWith(
      String(h.account.tenantId),
      'email',
      'ana@cliente.pe',
    );
    expect(h.convs[0].campaign).toEqual(campaign);
  });

  it('no reemplaza el origen ya asignado (primer toque)', async () => {
    const h = setup({
      campaign: { kind: 'campaign', id: 'x', name: 'Otra', at: new Date() },
    });
    const first = { kind: 'ad', id: '120', name: 'Promo', at: new Date() };
    const svc = h.service as any;
    const conv = await svc.upsertConversation(
      'whatsapp',
      String(h.account.tenantId),
      String(h.account._id),
      { contact: '51999888777', type: 'text' },
      false,
    );
    conv.campaign = first;
    const again = await svc.upsertConversation(
      'whatsapp',
      String(h.account.tenantId),
      String(h.account._id),
      {
        contact: '51999888777',
        type: 'text',
        referral: { adId: '999', headline: 'Otro anuncio' },
      },
      true,
    );
    expect(again.campaign).toBe(first);
  });

  it('filtra la bandeja por campaña e ignora filtros mal formados', async () => {
    const h = setup();
    const id = new Types.ObjectId().toString();
    await h.service.listConversations(String(h.account.tenantId), {
      campaign: `campaign:${id}`,
    });
    expect(h.convModel.find.mock.calls[0][0]).toMatchObject({
      tenantId: h.account.tenantId,
      'campaign.kind': 'campaign',
      'campaign.id': id,
    });
    await h.service.listConversations(String(h.account.tenantId), {
      campaign: 'ad:{"$gt":""}',
    });
    expect(h.convModel.find.mock.calls[1][0]).not.toHaveProperty([
      'campaign.id',
    ]);
  });

  it('lista las campañas de la empresa con su número de chats', async () => {
    const h = setup();
    const res = await h.service.listCampaigns(
      String(h.account.tenantId),
      'whatsapp',
    );
    const [pipeline] = h.convModel.aggregate.mock.calls[0] as any[];
    expect(pipeline[0].$match).toMatchObject({
      tenantId: h.account.tenantId,
      channel: 'whatsapp',
    });
    expect(res).toEqual([
      { key: 'ad:120', kind: 'ad', id: '120', name: 'Promo verano', count: 4 },
    ]);
  });

  it('al arrancar marca los chats de anuncios antiguos sin origen', async () => {
    const h = setup();
    await h.service.onModuleInit();
    const [filter, pipeline] = h.convModel.updateMany.mock.calls[0] as any[];
    expect(filter).toEqual({
      campaign: { $exists: false },
      'adReferral.adId': { $exists: true, $ne: null },
    });
    expect(pipeline[0].$set.campaign).toMatchObject({
      kind: 'ad',
      id: { $toString: '$adReferral.adId' },
    });
  });

  it('un chat de anuncio de Click-to-WhatsApp queda con su campaña', async () => {
    const h = setup();
    const conv = await (h.service as any).upsertConversation(
      'whatsapp',
      String(h.account.tenantId),
      String(h.account._id),
      {
        contact: '51911222333',
        type: 'text',
        referral: { adId: '120', ctwaClid: 'c', headline: 'Promo verano' },
      },
      true,
    );
    expect(conv.campaign).toMatchObject({
      kind: 'ad',
      id: '120',
      name: 'Promo verano',
    });
    // El anuncio gana: no se buscan campañas de Maya.
    expect(h.attribution.lookup).not.toHaveBeenCalled();
  });

  it('al escribir el negocio (saliente) no se atribuye campaña', async () => {
    const h = setup();
    await (h.service as any).upsertConversation(
      'email',
      String(h.account.tenantId),
      String(h.account._id),
      { contact: 'x@y.pe', type: 'text' },
    );
    expect(h.attribution.lookup).not.toHaveBeenCalled();
  });

  it('le pasa al agente el contexto para agendar y deja una nota por cada cita', async () => {
    const h = setup({
      bookings: [
        {
          start: new Date('2026-11-10T20:00:00Z'),
          end: new Date('2026-11-10T20:30:00Z'),
          title: 'Cita – Ana',
          contactName: 'Ana Ruiz',
          attendeeEmail: 'ana@cliente.pe',
          joinUrl: 'https://meet.google.com/abc',
          provider: 'google',
          eventId: 'ev-1',
        },
      ],
    });
    await h.service.handleEmailInbound(h.account as never, email());
    await flush();

    const options = h.agents.generateAnswer.mock.calls[0][3];
    expect(options).toMatchObject({
      conversationId: String(h.convs[0]._id),
      contactName: 'Ana Ruiz',
      contactEmail: 'ana@cliente.pe',
    });
    const notes = fakeAssignment.note.mock.calls.map((c) => c[1] as string);
    const note = notes.find((t) => t.includes('agendó una cita'));
    expect(note).toContain('Sofía agendó una cita');
    expect(note).toContain('10 de noviembre');
    expect(note).toContain('15:00');
    expect(note).toContain('https://meet.google.com/abc');
  });

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

  it('al volver al agente, ve lo que la persona escribió en manual (sin notas internas)', async () => {
    const h = setup();
    await h.service.handleEmailInbound(h.account as never, email());
    await flush();
    const conv = h.convs[0];
    await h.service.sendManual(
      String(conv._id),
      String(h.account.tenantId),
      new Types.ObjectId().toString(),
      { text: 'Le hago un 20% de descuento si cierra hoy' },
    );
    expect(conv.autoReply).toBe(false);
    h.msgs.push(
      Object.assign(
        {
          _id: new Types.ObjectId(),
          conversationId: conv._id,
          direction: 'out',
          author: 'system',
          type: 'text',
          text: 'Nota interna del equipo',
          status: 'sent',
        },
        { save: jest.fn() },
      ),
    );

    conv.autoReply = true;
    await h.service.handleEmailInbound(
      h.account as never,
      email({ messageId: '<in-2@cliente.pe>', text: '¿Sigue en pie?' }),
    );
    await flush();

    const history = h.agents.generateAnswer.mock.calls.at(-1)[2];
    expect(history).toContainEqual({
      role: 'assistant',
      content: 'Le hago un 20% de descuento si cierra hoy',
    });
    expect(JSON.stringify(history)).not.toContain('Nota interna');
  });
});
