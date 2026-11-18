import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { createHmac } from 'crypto';
import {
  ApiWebhookService,
  WEBHOOK_BACKOFF_MS,
  WEBHOOK_MAX_ATTEMPTS,
  signWebhook,
} from './api-webhook.service';
import { SecretBox } from '../shared/secret-box';

jest.mock('../shared/network', () => ({
  assertPublicHost: jest.fn((host: string) =>
    /^(127\.|10\.|localhost)/.test(host)
      ? Promise.reject(new Error('privada'))
      : Promise.resolve(),
  ),
}));

const TENANT = new Types.ObjectId();
const JWT = 'secreto-de-prueba';

function harness() {
  const box = new SecretBox(JWT);
  const access: any = {
    _id: new Types.ObjectId(),
    tenantId: TENANT,
    webhookUrl: 'https://hooks.mitienda.pe/maya',
    webhookSecret: box.encrypt('whsec_abc'),
    save: jest.fn(() => Promise.resolve()),
  };
  const accessModel: any = {
    findOne: jest.fn((f: any) => ({
      exec: () =>
        Promise.resolve(
          String(f._id) === String(access._id) &&
            String(f.tenantId) === String(TENANT)
            ? access
            : null,
        ),
    })),
    findById: jest.fn(() => ({ exec: () => Promise.resolve(access) })),
    updateOne: jest.fn(() => ({ exec: () => Promise.resolve({}) })),
  };
  const store: any[] = [];
  const deliveries: any = {
    create: jest.fn((doc: any) => {
      if (
        store.some(
          (d) =>
            String(d.accessId) === String(doc.accessId) &&
            d.refId === doc.refId &&
            d.event === doc.event,
        )
      )
        return Promise.reject(Object.assign(new Error('dup'), { code: 11000 }));
      const d = {
        status: 'pending',
        attempts: 0,
        ...doc,
        save: jest.fn(() => Promise.resolve()),
      };
      store.push(d);
      return Promise.resolve(d);
    }),
    findOneAndUpdate: jest.fn((f: any) => ({
      exec: () =>
        Promise.resolve(
          store.find(
            (d) =>
              String(d._id) === String(f._id) &&
              d.status === 'pending' &&
              d.nextAttemptAt <= f.nextAttemptAt.$lte,
          ) ?? null,
        ),
    })),
  };
  const convModel: any = {
    findById: jest.fn(() => ({
      select: () => ({
        lean: () => ({
          exec: () =>
            Promise.resolve({ contact: '51999888777', channel: 'whatsapp' }),
        }),
      }),
    })),
  };
  const msgModel: any = {
    distinct: jest.fn(() => ({ exec: () => Promise.resolve([access._id]) })),
  };
  const events: any = { on: jest.fn() };
  const config: any = {
    get: () => undefined,
    getOrThrow: () => JWT,
  };
  const service = new ApiWebhookService(
    accessModel,
    deliveries,
    convModel,
    msgModel,
    events,
    config,
  );
  const post = jest.spyOn(service, 'post').mockResolvedValue({ status: 200 });
  // El primer intento sale solo al encolar: aquí se controla a mano.
  const attempt = jest.spyOn(service, 'attempt');
  return { service, access, store, post, attempt, accessModel };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('ApiWebhookService (HU15)', () => {
  describe('configuración', () => {
    it('C1: rechaza http y hosts internos; con https pública devuelve el secreto una vez', async () => {
      const h = harness();
      h.access.webhookSecret = undefined;
      const id = String(h.access._id);
      await expect(
        h.service.setUrl(String(TENANT), id, 'http://hooks.mitienda.pe'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        h.service.setUrl(String(TENANT), id, 'https://127.0.0.1/x'),
      ).rejects.toBeInstanceOf(BadRequestException);

      const first = await h.service.setUrl(
        String(TENANT),
        id,
        'https://hooks.mitienda.pe/maya',
      );
      expect(first.secret).toMatch(/^whsec_/);
      expect(h.access.webhookSecret).not.toContain(first.secret);

      const second = await h.service.setUrl(
        String(TENANT),
        id,
        'https://hooks.mitienda.pe/otra',
      );
      expect(second.secret).toBeUndefined();
    });

    it('C2: rotar da otro secreto; otra empresa recibe 404', async () => {
      const h = harness();
      const id = String(h.access._id);
      const before = h.access.webhookSecret;
      const { secret } = await h.service.rotateSecret(String(TENANT), id);
      expect(secret).toMatch(/^whsec_/);
      expect(h.access.webhookSecret).not.toBe(before);
      await expect(
        h.service.rotateSecret(String(new Types.ObjectId()), id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('C2: quitar la URL borra URL y secreto; un acceso revocado no rota', async () => {
      const h = harness();
      const id = String(h.access._id);
      await expect(h.service.removeUrl(String(TENANT), id)).resolves.toEqual({
        removed: true,
      });
      expect(h.accessModel.updateOne).toHaveBeenCalledWith(
        { _id: h.access._id },
        { $unset: { webhookUrl: 1, webhookSecret: 1 } },
      );
      await expect(
        h.service.removeUrl(String(new Types.ObjectId()), id),
      ).rejects.toBeInstanceOf(NotFoundException);
      h.access.revokedAt = new Date();
      await expect(h.service.rotateSecret(String(TENANT), id)).rejects.toThrow(
        'revocado',
      );
    });
  });

  describe('eventos', () => {
    it('C3: un ack repetido no duplica el aviso; pending no avisa', async () => {
      const h = harness();
      const msg: any = {
        _id: new Types.ObjectId(),
        apiAccessId: h.access._id,
        conversationId: new Types.ObjectId(),
        status: 'delivered',
        at: new Date(),
      };
      await h.service.onMessage('updated', String(TENANT), msg);
      await h.service.onMessage('updated', String(TENANT), msg);
      await h.service.onMessage('updated', String(TENANT), {
        ...msg,
        status: 'pending',
      });
      await h.service.onMessage('updated', String(TENANT), {
        ...msg,
        status: 'read',
      });
      expect(h.store.map((d) => d.event)).toEqual([
        'message.delivered',
        'message.read',
      ]);
      expect(h.store[0].payload.data).toMatchObject({
        status: 'delivered',
        channel: 'whatsapp',
        to: '51999888777',
      });
    });

    it('C4: un entrante en una conversación del acceso avisa message.received', async () => {
      const h = harness();
      await h.service.onMessage('created', String(TENANT), {
        _id: new Types.ObjectId(),
        conversationId: new Types.ObjectId(),
        direction: 'in',
        type: 'text',
        text: 'Gracias',
        at: new Date(),
      } as any);
      expect(h.store).toHaveLength(1);
      expect(h.store[0].event).toBe('message.received');
      expect(h.store[0].payload.data).toMatchObject({
        text: 'Gracias',
        from: '51999888777',
      });
    });

    it('C9: el resultado de un SMS se avisa', async () => {
      const h = harness();
      await h.service.onSms(h.access, {
        _id: new Types.ObjectId(),
        status: 'sent',
        to: '+51999888777',
        segments: 1,
        at: new Date(),
      } as any);
      expect(h.store[0].event).toBe('message.sent');
      expect(h.store[0].payload.data.channel).toBe('sms');
    });
  });

  describe('entrega', () => {
    it('C5: firma HMAC-SHA256 de "<timestamp>.<cuerpo>" con el secreto', async () => {
      const h = harness();
      const d = await h.service.enqueue(h.access, 'ping', 'r1', { a: 1 });
      await flush();
      expect(d!.status).toBe('delivered');
      const [url, body, headers] = h.post.mock.calls[0];
      expect(url).toBe('https://hooks.mitienda.pe/maya');
      const expected =
        'sha256=' +
        createHmac('sha256', 'whsec_abc')
          .update(`${headers['X-Maya-Timestamp']}.${body}`)
          .digest('hex');
      expect(headers['X-Maya-Signature']).toBe(expected);
      expect(signWebhook('whsec_abc', headers['X-Maya-Timestamp'], body)).toBe(
        expected,
      );
      expect(headers['X-Maya-Event']).toBe('ping');
      expect(JSON.parse(body)).toMatchObject({ event: 'ping', data: { a: 1 } });
    });

    it('C6: 500 reprograma a +1 min y al 6.º fallo queda failed', async () => {
      const h = harness();
      h.post.mockResolvedValue({ status: 500 });
      const d: any = await h.service.enqueue(h.access, 'ping', 'r2', {});
      await flush();
      expect(d.status).toBe('pending');
      expect(d.attempts).toBe(1);
      expect(d.lastStatus).toBe(500);
      const t0 = d.nextAttemptAt.getTime();
      expect(t0 - Date.now()).toBeGreaterThan(WEBHOOK_BACKOFF_MS[0] - 5_000);

      let now = new Date(t0);
      while (d.status === 'pending') {
        await h.service.attempt(d._id, now);
        now = new Date(d.nextAttemptAt.getTime());
      }
      expect(d.attempts).toBe(WEBHOOK_MAX_ATTEMPTS);
      expect(d.status).toBe('failed');
      expect(d.lastError).toContain('500');
    });
  });
});
