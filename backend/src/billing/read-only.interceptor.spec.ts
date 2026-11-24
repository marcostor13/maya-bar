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
});
