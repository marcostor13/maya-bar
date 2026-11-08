import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import * as webpush from 'web-push';
import { PushService } from './push.service';
import { PushSubscription } from './push-subscription.schema';
import { PushAudienceService } from './push-audience.service';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

const tenantId = new Types.ObjectId().toString();
const userA = new Types.ObjectId().toString();
const userB = new Types.ObjectId().toString();

const makeSub = (over: Partial<Record<string, unknown>> = {}) => ({
  _id: new Types.ObjectId(),
  endpoint: 'https://push.example/abc',
  p256dh: 'p256dh-key',
  auth: 'auth-key',
  ...over,
});

/** `find().select().sort().lean()` que resuelve a `rows`. */
const chain = (rows: unknown) => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'sort']) q[m] = () => q;
  q.lean = () => Promise.resolve(rows);
  return q;
};

describe('PushService (Web Push)', () => {
  let service: PushService;
  let subs: any;
  let audience: { forUsers: jest.Mock; forModule: jest.Mock };

  const build = async (env: Record<string, string | undefined>) => {
    subs = {
      find: jest.fn().mockResolvedValue([]),
      distinct: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      countDocuments: jest.fn().mockResolvedValue(0),
      findOneAndUpdate: jest.fn().mockResolvedValue(makeSub()),
    };
    audience = {
      forUsers: jest.fn().mockResolvedValue([]),
      forModule: jest.fn().mockResolvedValue([]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: getModelToken(PushSubscription.name), useValue: subs },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
        { provide: PushAudienceService, useValue: audience },
      ],
    }).compile();
    service = module.get(PushService);
    service.onModuleInit();
  };

  const vapid = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' };

  beforeEach(() => jest.clearAllMocks());

  it('queda desactivado y no envía nada sin VAPID', async () => {
    await build({});
    expect(service.isEnabled()).toBe(false);
    expect(
      await service.sendToTenant(tenantId, { title: 'x', body: 'y' }),
    ).toBe(0);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('envía solo a los usuarios que la audiencia aprueba para el módulo', async () => {
    await build(vapid);
    audience.forModule.mockResolvedValue([userA]);
    subs.find.mockResolvedValue([
      makeSub({ endpoint: 'https://push.example/1' }),
    ]);
    (webpush.sendNotification as jest.Mock).mockResolvedValue({});

    const sent = await service.sendToTenant(
      tenantId,
      {
        title: 'Ana',
        body: 'Hola',
        url: '/inbox?c=1',
        category: 'chats',
        badge: 4,
      },
      { moduleKey: 'inbox', excludeUserId: userB },
    );

    expect(sent).toBe(1);
    expect(audience.forModule).toHaveBeenCalledWith(tenantId, 'inbox', {
      category: 'chats',
      excludeUserId: userB,
    });
    expect(subs.find).toHaveBeenCalledWith({
      userId: { $in: [new Types.ObjectId(userA)] },
    });
    const [, payload] = (webpush.sendNotification as jest.Mock).mock
      .calls[0] as [unknown, string];
    const body = JSON.parse(payload) as Record<string, unknown>;
    expect(body).toMatchObject({ title: 'Ana', url: '/inbox?c=1', badge: 4 });
    // La categoría solo elige destinatarios: no viaja al navegador.
    expect(body).not.toHaveProperty('category');
  });

  it('no envía si la audiencia no aprueba a nadie (preferencias, inactivo)', async () => {
    await build(vapid);
    audience.forUsers.mockResolvedValue([]);
    const sent = await service.sendToUser(userA, {
      title: 'x',
      body: 'y',
      category: 'leads',
    });
    expect(sent).toBe(0);
    expect(audience.forUsers).toHaveBeenCalledWith([userA], 'leads');
    expect(subs.find).not.toHaveBeenCalled();
  });

  it('borra las suscripciones que el navegador ya descartó (410)', async () => {
    await build(vapid);
    audience.forUsers.mockResolvedValue([userA]);
    subs.find.mockResolvedValue([
      makeSub({ endpoint: 'https://push.example/gone' }),
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({
      statusCode: 410,
    });

    const sent = await service.sendToUser(userA, { title: 'x', body: 'y' });

    expect(sent).toBe(0);
    expect(subs.deleteMany).toHaveBeenCalledWith({
      endpoint: { $in: ['https://push.example/gone'] },
    });
  });

  it('nunca lanza si la base o el proveedor fallan', async () => {
    await build(vapid);
    audience.forModule.mockResolvedValue([userA]);
    subs.find.mockRejectedValue(new Error('mongo caído'));
    await expect(
      service.sendToTenant(
        tenantId,
        { title: 'x', body: 'y' },
        { moduleKey: 'inbox' },
      ),
    ).resolves.toBe(0);
  });

  it('lista los dispositivos del usuario sin endpoint ni claves', async () => {
    await build(vapid);
    const id = new Types.ObjectId();
    subs.find.mockReturnValue(
      chain([
        {
          _id: id,
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
          installed: true,
        },
      ]),
    );
    const list = await service.listForUser(userA);
    expect(subs.find).toHaveBeenCalledWith({
      userId: new Types.ObjectId(userA),
    });
    expect(list).toEqual([
      expect.objectContaining({
        id: String(id),
        kind: 'web',
        label: 'Safari en iPhone',
        installed: true,
      }),
    ]);
    expect(list[0]).not.toHaveProperty('endpoint');
  });

  it('solo borra un dispositivo si es del usuario', async () => {
    await build(vapid);
    const id = new Types.ObjectId().toString();
    await service.removeById(id, userA);
    expect(subs.deleteOne).toHaveBeenCalledWith({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userA),
    });
    expect(await service.removeById('no-es-id', userA)).toEqual({
      removed: 0,
    });
  });
});
