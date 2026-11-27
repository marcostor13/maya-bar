import { lastValueFrom, of } from 'rxjs';
import type { ExecutionContext } from '@nestjs/common';
import { ReadOnlyInterceptor } from './read-only.interceptor';
import { TRIAL_ENDED_MESSAGE } from './subscription-access';

const ctx = (method: string, url: string, user?: object, apiAccess?: object) =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method, url, originalUrl: url, user, apiAccess }),
    }),
  }) as unknown as ExecutionContext;

const handler = { handle: () => of('ok') };
const user = { tenantId: '507f1f77bcf86cd799439011', role: 'TENANT_ADMIN' };

describe('ReadOnlyInterceptor (HU41)', () => {
  const expired = {
    access: jest.fn().mockResolvedValue({
      readOnly: true,
      reason: TRIAL_ENDED_MESSAGE,
    }),
  };
  const interceptor = new ReadOnlyInterceptor(expired as never);

  it('con la prueba vencida, un POST de envío responde 402 con el mensaje (C2)', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(
          ctx('POST', '/conversations/c1/messages', user),
          handler,
        ),
      ),
    ).rejects.toMatchObject({
      status: 402,
      response: { code: 'SUBSCRIPTION_REQUIRED', message: TRIAL_ENDED_MESSAGE },
    });
  });

  it('la API pública con clave tampoco envía con la prueba vencida', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(
          ctx('POST', '/public/v1/messages', undefined, {
            tenantId: user.tenantId,
          }),
          handler,
        ),
      ),
    ).rejects.toMatchObject({ status: 402 });
  });

  it('GET sigue funcionando (C2)', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx('GET', '/customers', user), handler),
      ),
    ).resolves.toBe('ok');
  });

  it('pagar, sesión y rutas sin usuario siguen abiertas', async () => {
    for (const c of [
      ctx('POST', '/billing/checkout', user),
      ctx('POST', '/auth/logout', user),
      ctx('POST', '/whatsapp/webhook'),
      ctx('PATCH', '/tenants/x', { ...user, role: 'SUPERADMIN' }),
    ])
      await expect(
        lastValueFrom(interceptor.intercept(c, handler)),
      ).resolves.toBe('ok');
  });

  it('con el plan vigente las escrituras pasan', async () => {
    const ok = new ReadOnlyInterceptor({
      access: jest.fn().mockResolvedValue({ readOnly: false }),
    } as never);
    await expect(
      lastValueFrom(ok.intercept(ctx('POST', '/customers', user), handler)),
    ).resolves.toBe('ok');
  });

  describe('cuenta demo (HU88)', () => {
    const demo = new ReadOnlyInterceptor({
      access: jest.fn().mockResolvedValue({ readOnly: false, demo: true }),
    } as never);
    const run = (method: string, url: string, u: object = user) =>
      lastValueFrom(demo.intercept(ctx(method, url, u), handler));

    it.each([
      ['POST', '/customers'],
      ['DELETE', '/customers/c1'],
      ['PATCH', '/auth/change-password'],
      ['PATCH', '/users/me'],
      ['PATCH', '/tenants/me'],
      ['POST', '/billing/checkout'],
      ['POST', '/notifications/read-all'],
    ])('C6: %s %s responde 403 DEMO_READ_ONLY', async (method, url) => {
      await expect(run(method, url)).rejects.toMatchObject({
        status: 403,
        response: { code: 'DEMO_READ_ONLY' },
      });
    });

    it('C6: renovar y cerrar la sesión siguen funcionando', async () => {
      await expect(run('POST', '/auth/refresh')).resolves.toBe('ok');
      await expect(run('POST', '/auth/logout')).resolves.toBe('ok');
    });

    it('C6: ver (GET) sigue funcionando', async () => {
      await expect(run('GET', '/customers')).resolves.toBe('ok');
    });

    it('C6: el superadmin no queda limitado', async () => {
      await expect(
        run('POST', '/demo/reset', { role: 'SUPERADMIN' }),
      ).resolves.toBe('ok');
    });
  });
});
