import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  ApiMessagesService,
  maskContact,
  renderTemplate,
  templateVariableCount,
} from './api-messages.service';
import type { ApiAccess } from './api-access.schema';
import type { SendApiMessageDto } from './dto/api-access.dto';

const TENANT = new Types.ObjectId();
const ACCOUNT = new Types.ObjectId();
const PHONE = '51999888777';
const HOUR = 3600_000;

interface Opts {
  channel?: 'whatsapp' | 'instagram' | 'messenger';
  conv?: Record<string, unknown> | null;
  lastInboundAgoMs?: number | null;
  template?: Record<string, unknown> | null;
  blocked?: boolean;
  suppressed?: boolean;
  existingByKey?: Record<string, unknown> | null;
  liveAccountError?: Error;
}

function harness(opts: Opts = {}) {
  const channel = opts.channel ?? 'whatsapp';
  const access = {
    _id: new Types.ObjectId(),
    tenantId: TENANT,
    accountId: ACCOUNT,
    channel,
    name: 'Web',
  } as unknown as ApiAccess;
  const convId = new Types.ObjectId();
  const conv =
    opts.conv === null
      ? null
      : { _id: convId, contact: PHONE, blocked: false, ...(opts.conv ?? {}) };

  const convModel: any = {
    findOne: jest.fn(() => ({ exec: () => Promise.resolve(conv) })),
    findById: jest.fn(() => ({
      select: () => ({
        lean: () => ({
          exec: () => Promise.resolve(conv ?? { contact: PHONE }),
        }),
      }),
    })),
  };
  const lastInbound =
    opts.lastInboundAgoMs === null
      ? null
      : { at: new Date(Date.now() - (opts.lastInboundAgoMs ?? HOUR)) };
  const msgModel: any = {
    findOne: jest.fn((filter: any) => {
      if (filter.apiIdempotencyKey)
        return { exec: () => Promise.resolve(opts.existingByKey ?? null) };
      if (filter.apiAccessId)
        return { exec: () => Promise.resolve(opts.existingByKey ?? null) };
      return {
        sort: () => ({
          select: () => ({
            lean: () => ({ exec: () => Promise.resolve(lastInbound) }),
          }),
        }),
      };
    }),
  };
  const templateModel: any = {
    findOne: jest.fn(() => ({
      exec: () => Promise.resolve(opts.template ?? null),
    })),
  };
  const accesses: any = {
    consumeQuota: jest.fn(() => Promise.resolve()),
    liveAccount: jest.fn(() =>
      opts.liveAccountError
        ? Promise.reject(opts.liveAccountError)
        : Promise.resolve({}),
    ),
    markUsed: jest.fn(() => Promise.resolve()),
  };
  const sent: any[] = [];
  const conversations: any = {
    sendExternal: jest.fn((input: any) => {
      sent.push(input);
      return Promise.resolve({
        conversation: { _id: convId, contact: input.contact },
        message: {
          _id: new Types.ObjectId(),
          status: 'sent',
          at: new Date(),
          conversationId: convId,
        },
        duplicate: false,
      });
    }),
  };
  const blocked: any = {
    isBlocked: jest.fn(() => Promise.resolve(!!opts.blocked)),
  };
  const suppression: any = {
    isSuppressed: jest.fn(() => Promise.resolve(!!opts.suppressed)),
  };
  const service = new ApiMessagesService(
    convModel,
    msgModel,
    templateModel,
    accesses,
    conversations,
    blocked,
    suppression,
  );
  return { service, access, sent, accesses, conversations, msgModel };
}

const text = (extra: Partial<SendApiMessageDto> = {}): SendApiMessageDto => ({
  to: '+51 999 888 777',
  text: 'Hola',
  ...extra,
});

const approved = {
  name: 'pedido_listo',
  language: 'es',
  status: 'APPROVED',
  body: 'Hola {{1}}, tu pedido {{2}} está listo.',
};

describe('ApiMessagesService', () => {
  describe('envío (C3)', () => {
    it('C3: un texto a un chat con entrante reciente se envía y cuenta el uso', async () => {
      const { service, access, sent, accesses } = harness();
      const { message, duplicate } = await service.send(access, text());

      expect(duplicate).toBe(false);
      expect(message).toEqual(
        expect.objectContaining({
          status: 'sent',
          channel: 'whatsapp',
          to: PHONE,
        }),
      );
      expect(sent[0]).toEqual(
        expect.objectContaining({
          tenantId: String(TENANT),
          accountId: String(ACCOUNT),
          contact: PHONE,
          type: 'text',
          text: 'Hola',
          api: expect.objectContaining({ accessName: 'Web' }),
        }),
      );
      expect(accesses.consumeQuota).toHaveBeenCalled();
      expect(accesses.markUsed).toHaveBeenCalled();
    });

    it('un archivo https viaja con su tipo y su pie', async () => {
      const { service, access, sent } = harness();
      await service.send(
        access,
        text({
          text: 'Tu factura',
          mediaUrl: 'https://cdn.x.com/f.pdf',
          mediaType: 'document',
          filename: 'factura.pdf',
        }),
      );
      expect(sent[0]).toEqual(
        expect.objectContaining({
          type: 'document',
          text: 'Tu factura',
          mediaUrl: 'https://cdn.x.com/f.pdf',
          filename: 'factura.pdf',
        }),
      );
    });
  });

  describe('validación del cuerpo (C14)', () => {
    it.each([
      ['sin contenido', { text: '' }],
      ['mediaUrl http', { mediaUrl: 'http://x.com/a.png' }],
      ['mediaType sin mediaUrl', { text: 'x', mediaType: 'image' as const }],
      ['número inválido', { to: 'abc' }],
    ])('C14: %s → 400', async (_name, extra) => {
      const { service, access, sent } = harness();
      await expect(service.send(access, text(extra))).rejects.toThrow(
        BadRequestException,
      );
      expect(sent).toHaveLength(0);
    });

    it('plantilla fuera de WhatsApp, o plantilla con texto → 400', async () => {
      const ig = harness({ channel: 'instagram' });
      await expect(
        ig.service.send(ig.access, {
          to: 'igsid_123',
          template: { name: 'x' },
        }),
      ).rejects.toThrow(BadRequestException);
      const wa = harness();
      await expect(
        wa.service.send(
          wa.access,
          text({ template: { name: 'x', variables: [] } }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cuenta, bloqueos y no contactar (C5, C8)', () => {
    it('C5: cuenta caída → 409 sin enviar', async () => {
      const { service, access, sent } = harness({
        liveAccountError: new ConflictException('caída'),
      });
      await expect(service.send(access, text())).rejects.toThrow(
        ConflictException,
      );
      expect(sent).toHaveLength(0);
    });

    it.each([
      ['bloqueado', { blocked: true }],
      ['en No contactar', { suppressed: true }],
      ['con el chat bloqueado', { conv: { blocked: true } }],
    ])('C8: contacto %s → 422 sin enviar', async (_n, o) => {
      const { service, access, sent } = harness(o);
      await expect(service.send(access, text())).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(sent).toHaveLength(0);
    });
  });

  describe('ventana de 24 h (C6)', () => {
    it('C6: WhatsApp sin entrante en 24 h y texto → 422 que pide plantilla', async () => {
      const { service, access, sent } = harness({
        lastInboundAgoMs: 25 * HOUR,
      });
      await expect(service.send(access, text())).rejects.toThrow(
        /plantilla aprobada/,
      );
      expect(sent).toHaveLength(0);
    });

    it('C6: WhatsApp sin chat previo con plantilla → se envía', async () => {
      const { service, access, sent } = harness({
        conv: null,
        template: approved,
      });
      await service.send(access, {
        to: '+51999888777',
        template: { name: 'pedido_listo', variables: ['Ana', '#12'] },
      });
      expect(sent[0].template).toEqual({
        name: 'pedido_listo',
        language: 'es',
        variables: ['Ana', '#12'],
        header: undefined,
      });
      expect(sent[0].text).toBe('Hola Ana, tu pedido #12 está listo.');
    });

    it('C6: Instagram sin conversación → 422', async () => {
      const { service, access } = harness({
        channel: 'instagram',
        conv: null,
      });
      await expect(
        service.send(access, { to: 'igsid_123', text: 'hola' }),
      ).rejects.toThrow(/últimas 24 h/);
    });

    it('C6: Messenger con entrante de hace 2 h → se envía', async () => {
      const { service, access, sent } = harness({
        channel: 'messenger',
        lastInboundAgoMs: 2 * HOUR,
      });
      await service.send(access, { to: 'psid_123', text: 'hola' });
      expect(sent[0].contact).toBe('psid_123');
    });
  });

  describe('plantillas (C7)', () => {
    it.each([
      ['inexistente', null, ['a', 'b'], /No existe/],
      [
        'no aprobada',
        { ...approved, status: 'PENDING' },
        ['a', 'b'],
        /no está aprobada/,
      ],
      ['con variables de menos', approved, ['a'], /necesita 2/],
      ['con una variable vacía', approved, ['a', ' '], /necesita 2/],
    ])('C7: plantilla %s → 422', async (_n, template, variables, msg) => {
      const { service, access, sent } = harness({
        template: template as Record<string, unknown> | null,
      });
      await expect(
        service.send(access, {
          to: PHONE,
          template: { name: 'pedido_listo', variables: variables },
        }),
      ).rejects.toThrow(msg);
      expect(sent).toHaveLength(0);
    });

    it('C7: cabecera con imagen exige headerMediaUrl https (o la de la plantilla)', async () => {
      const withImage = { ...approved, headerType: 'IMAGE' };
      const a = harness({ template: withImage });
      await expect(
        a.service.send(a.access, {
          to: PHONE,
          template: { name: 'pedido_listo', variables: ['a', 'b'] },
        }),
      ).rejects.toThrow(/headerMediaUrl/);

      const b = harness({ template: withImage });
      await b.service.send(b.access, {
        to: PHONE,
        template: {
          name: 'pedido_listo',
          variables: ['a', 'b'],
          headerMediaUrl: 'https://cdn.x.com/p.jpg',
        },
      });
      expect(b.sent[0].template.header).toEqual({
        format: 'IMAGE',
        mediaUrl: 'https://cdn.x.com/p.jpg',
      });
    });

    it('C7: cabecera de texto con variable exige headerText', async () => {
      const t = { ...approved, headerType: 'TEXT', headerText: 'Hola {{1}}' };
      const a = harness({ template: t });
      await expect(
        a.service.send(a.access, {
          to: PHONE,
          template: { name: 'pedido_listo', variables: ['a', 'b'] },
        }),
      ).rejects.toThrow(/headerText/);
      const b = harness({ template: t });
      await b.service.send(b.access, {
        to: PHONE,
        template: {
          name: 'pedido_listo',
          variables: ['a', 'b'],
          headerText: 'Ana',
        },
      });
      expect(b.sent[0].template.header).toEqual({
        format: 'TEXT',
        text: 'Ana',
      });
    });
  });

  describe('idempotencia y estado (C10, C11)', () => {
    it('C10: una Idempotency-Key ya usada devuelve el mensaje sin enviar ni contar', async () => {
      const existing = {
        _id: new Types.ObjectId(),
        status: 'delivered',
        at: new Date(),
        conversationId: new Types.ObjectId(),
      };
      const { service, access, sent, accesses } = harness({
        existingByKey: existing,
      });
      const { message, duplicate } = await service.send(
        access,
        text(),
        'pedido-12',
      );
      expect(duplicate).toBe(true);
      expect(message.id).toBe(String(existing._id));
      expect(message.status).toBe('delivered');
      expect(sent).toHaveLength(0);
      expect(accesses.consumeQuota).not.toHaveBeenCalled();
    });

    it('C10: la clave viaja al envío para que el índice resuelva carreras', async () => {
      const { service, access, sent } = harness();
      await service.send(access, text(), ' k-1 ');
      expect(sent[0].api.idempotencyKey).toBe('k-1');
    });

    it('una Idempotency-Key demasiado larga → 400', async () => {
      const { service, access } = harness();
      await expect(
        service.send(access, text(), 'x'.repeat(129)),
      ).rejects.toThrow(BadRequestException);
    });

    it('C11: el estado de un mensaje propio; ajeno o id inválido → 404', async () => {
      const own = {
        _id: new Types.ObjectId(),
        status: 'failed',
        error: 'CloudAPI 400 #131026',
        at: new Date(),
        conversationId: new Types.ObjectId(),
      };
      const a = harness({ existingByKey: own });
      const view = await a.service.status(a.access, String(own._id));
      expect(view).toEqual(
        expect.objectContaining({
          id: String(own._id),
          status: 'failed',
          error: 'CloudAPI 400 #131026',
          to: PHONE,
        }),
      );
      expect(a.msgModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ apiAccessId: a.access._id }),
      );

      const b = harness({ existingByKey: null });
      await expect(
        b.service.status(b.access, String(new Types.ObjectId())),
      ).rejects.toThrow(NotFoundException);
      await expect(b.service.status(b.access, 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  it('helpers: variables, render y máscara', () => {
    expect(templateVariableCount('Hola {{1}} y {{ 3 }}')).toBe(3);
    expect(templateVariableCount(undefined)).toBe(0);
    expect(renderTemplate('Hola {{1}}, {{2}}', ['Ana'])).toBe(
      'Hola Ana, {{2}}',
    );
    expect(maskContact('51999888777')).toBe('51*****8777');
    expect(maskContact('abc')).toBe('***');
  });
});
