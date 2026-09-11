import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import * as webpush from 'web-push';
import { PushService } from './push.service';
import { PushSubscription } from './push-subscription.schema';
import { RolesService } from '../roles/roles.service';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

const tenantId = new Types.ObjectId().toString();

const makeSub = (over: Partial<Record<string, unknown>> = {}) => ({
  endpoint: 'https://push.example/abc',
  p256dh: 'p256dh-key',
  auth: 'auth-key',
  role: 'TENANT_ADMIN',
  ...over,
});

describe('PushService', () => {
  let service: PushService;
  let subs: any;
  let roles: any;

  const build = async (env: Record<string, string | undefined>) => {
    subs = {
      find: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      countDocuments: jest.fn().mockResolvedValue(0),
      findOneAndUpdate: jest.fn().mockResolvedValue(makeSub()),
    };
    roles = {
      accessFor: jest
        .fn()
        .mockResolvedValue({ modules: ['inbox'], actions: {} }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: getModelToken(PushSubscription.name), useValue: subs },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
        { provide: RolesService, useValue: roles },
      ],
    }).compile();
    service = module.get(PushService);
    service.onModuleInit();
  };

  beforeEach(() => jest.clearAllMocks());

  it('stays disabled and sends nothing when VAPID is not configured', async () => {
    await build({});
    expect(service.isEnabled()).toBe(false);
    expect(
      await service.sendToTenant(tenantId, { title: 'x', body: 'y' }),
    ).toBe(0);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('sends to every device of the tenant whose role has the module', async () => {
    await build({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
    subs.find.mockResolvedValue([
      makeSub({ endpoint: 'https://push.example/1' }),
      makeSub({ endpoint: 'https://push.example/2', role: 'KITCHEN' }),
    ]);
    roles.accessFor.mockImplementation((_t: string, role: string) =>
      Promise.resolve({
        modules: role === 'TENANT_ADMIN' ? ['inbox'] : [],
        actions: {},
      }),
    );
    (webpush.sendNotification as jest.Mock).mockResolvedValue({});

    const sent = await service.sendToTenant(
      tenantId,
      { title: 'Ana', body: 'Hola', url: '/inbox?c=1' },
      { moduleKey: 'inbox' },
    );

    expect(sent).toBe(1);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [subscription, payload] = (webpush.sendNotification as jest.Mock).mock
      .calls[0] as [{ endpoint: string }, string];
    expect(subscription.endpoint).toBe('https://push.example/1');
    expect(JSON.parse(payload)).toMatchObject({
      title: 'Ana',
      url: '/inbox?c=1',
    });
  });

  it('drops subscriptions the browser already discarded (410 Gone)', async () => {
    await build({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
    subs.find.mockResolvedValue([
      makeSub({ endpoint: 'https://push.example/gone' }),
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({
      statusCode: 410,
    });

    const sent = await service.sendToTenant(tenantId, {
      title: 'x',
      body: 'y',
    });

    expect(sent).toBe(0);
    expect(subs.deleteMany).toHaveBeenCalledWith({
      endpoint: { $in: ['https://push.example/gone'] },
    });
  });

  it('never throws when the database or the push service fails', async () => {
    await build({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
    subs.find.mockRejectedValue(new Error('mongo caído'));
    await expect(
      service.sendToTenant(tenantId, { title: 'x', body: 'y' }),
    ).resolves.toBe(0);
  });

  it('excludes the user that caused the event', async () => {
    await build({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
    const excluded = new Types.ObjectId().toString();
    await service.sendToTenant(
      tenantId,
      { title: 'x', body: 'y' },
      { excludeUserId: excluded },
    );
    expect(subs.find).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: { $ne: new Types.ObjectId(excluded) },
      }),
    );
  });
});
