import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PublicPlansController } from './public-plans.controller';

describe('GET /public/plans (HU40 C1)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [PublicPlansController],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('sin sesión devuelve 4 planes, PEN y USD en 3 periodos, límites y caché pública', async () => {
    const res = await request(app.getHttpServer())
      .get('/public/plans')
      .expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    const body = res.body as {
      plans: {
        id: string;
        prices: Record<string, Record<string, number> | null>;
        limits: Record<string, number | null>;
      }[];
    };
    expect(body.plans).toHaveLength(4);
    for (const p of body.plans.slice(0, 3)) {
      for (const c of ['PEN', 'USD'])
        expect(Object.keys(p.prices[c]!)).toEqual([
          'monthly',
          'quarterly',
          'annual',
        ]);
      expect(p.limits.users).toEqual(expect.any(Number));
    }
    expect(body.plans[3].prices.PEN).toBeNull();
  });
});
