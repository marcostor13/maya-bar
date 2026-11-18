import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ApiSmsService } from './api-sms.service';
import type { ApiAccess } from './api-access.schema';
import { smsSegments } from '../sms/sms-segments';

const TENANT = new Types.ObjectId();

interface Opts {
  suppressed?: boolean;
  providerError?: Error;
  liveError?: Error;
  existing?: Record<string, unknown> | null;
}

function harness(opts: Opts = {}) {
  const access = {
    _id: new Types.ObjectId(),
    tenantId: TENANT,
    accountId: new Types.ObjectId(),
    channel: 'sms',
    name: 'Web',
  } as unknown as ApiAccess;
  const created: any[] = [];
  const model: any = {
    findOne: jest.fn(() => ({
      exec: () => Promise.resolve(opts.existing ?? null),
    })),
    create: jest.fn((doc: any) => {
      const d = {
        _id: new Types.ObjectId(),
        ...doc,
        save: jest.fn(() => Promise.resolve()),
      };
      created.push(d);
      return Promise.resolve(d);
    }),
  };
  const accesses: any = {
    consumeQuota: jest.fn(() => Promise.resolve()),
    liveAccount: jest.fn(() =>
      opts.liveError ? Promise.reject(opts.liveError) : Promise.resolve({}),
    ),
    markUsed: jest.fn(() => Promise.resolve()),
  };
  const sms: any = {
    requireConfig: jest.fn(() => Promise.resolve({ defaultCountryCode: '51' })),
    dispatch: jest.fn(() =>
      opts.providerError
        ? Promise.reject(opts.providerError)
        : Promise.resolve({ id: 'prov-1', status: 200, response: 'ok' }),
    ),
  };
  const suppression: any = {
    isSuppressed: jest.fn(() => Promise.resolve(!!opts.suppressed)),
  };
  const webhooks: any = { onSms: jest.fn(() => Promise.resolve()) };
  const service = new ApiSmsService(
    model,
    accesses,
    sms,
    suppression,
    webhooks,
  );
  return { service, access, model, accesses, sms, created, webhooks };
}

describe('ApiSmsService (HU14)', () => {
  it('C3: envía el texto al número E.164 y lo registra como enviado', async () => {
    const h = harness();
    const { message, duplicate } = await h.service.send(h.access, {
      to: '+51 999 888 777',
      text: 'Hola',
    });
    expect(duplicate).toBe(false);
    expect(h.sms.dispatch).toHaveBeenCalledWith(
      expect.anything(),
      '+51999888777',
      'Hola',
    );
    expect(message).toMatchObject({
      status: 'sent',
      channel: 'sms',
      to: '+51999888777',
      segments: 1,
    });
    expect(h.created[0]).toMatchObject({ providerId: 'prov-1' });
    expect(h.accesses.consumeQuota).toHaveBeenCalled();
    expect(h.accesses.markUsed).toHaveBeenCalled();
    // HU15 C9: el resultado se avisa al webhook del acceso.
    expect(h.webhooks.onSms).toHaveBeenCalledWith(h.access, h.created[0]);
  });

  it('C4: un número en "No contactar" da 422 y no llama al proveedor', async () => {
    const h = harness({ suppressed: true });
    await expect(
      h.service.send(h.access, { to: '+51999888777', text: 'Hola' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(h.sms.dispatch).not.toHaveBeenCalled();
    expect(h.created).toHaveLength(0);
  });

  it.each([
    [{ to: '+51999888777', text: 'x', mediaUrl: 'https://a.com/x.png' }],
    [{ to: '+51999888777', template: { name: 'x' } }],
    [{ to: '+51999888777', text: '   ' }],
    [{ to: 'abc', text: 'Hola' }],
    [{ to: '+51999888777', text: 'a'.repeat(1601) }],
  ])('C5: rechaza con 400 %j', async (dto) => {
    const h = harness();
    await expect(h.service.send(h.access, dto as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.sms.dispatch).not.toHaveBeenCalled();
  });

  it('C6: si el proveedor ya no está activo, 409', async () => {
    const h = harness({ liveError: new ConflictException('x') });
    await expect(
      h.service.send(h.access, { to: '+51999888777', text: 'Hola' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.sms.dispatch).not.toHaveBeenCalled();
  });

  it('C7: con la misma Idempotency-Key devuelve el envío previo sin reenviar', async () => {
    const h = harness({
      existing: {
        _id: new Types.ObjectId(),
        status: 'sent',
        to: '+51999888777',
        segments: 1,
        at: new Date(),
      },
    });
    const { duplicate, message } = await h.service.send(
      h.access,
      { to: '+51999888777', text: 'Hola' },
      'pedido-1',
    );
    expect(duplicate).toBe(true);
    expect(message.status).toBe('sent');
    expect(h.sms.dispatch).not.toHaveBeenCalled();
  });

  it('C8: el estado de un id que no es del acceso da 404', async () => {
    const h = harness();
    await expect(
      h.service.status(h.access, String(new Types.ObjectId())),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.service.status(h.access, 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('C9: si el proveedor falla, queda "failed" con el error', async () => {
    const h = harness({
      providerError: new Error('El proveedor respondió 500'),
    });
    const { message } = await h.service.send(h.access, {
      to: '+51999888777',
      text: 'Hola',
    });
    expect(message).toMatchObject({
      status: 'failed',
      error: 'El proveedor respondió 500',
    });
    expect(JSON.stringify(message)).not.toContain('secreto');
  });
});

describe('smsSegments', () => {
  it('cuenta GSM-7 (160/153) y UCS-2 (70/67)', () => {
    expect(smsSegments('a'.repeat(160))).toBe(1);
    expect(smsSegments('a'.repeat(161))).toBe(2);
    expect(smsSegments('a'.repeat(306))).toBe(2);
    expect(smsSegments('a'.repeat(307))).toBe(3);
    expect(smsSegments('{'.repeat(80))).toBe(1);
    expect(smsSegments('{'.repeat(81))).toBe(2);
    expect(smsSegments('á'.repeat(70))).toBe(1);
    expect(smsSegments('á'.repeat(71))).toBe(2);
    expect(smsSegments('ñandú 😀')).toBe(1);
  });
});
