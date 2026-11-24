import {
  PLAN_IDS,
  PLANS,
  priceFor,
  publicCatalog,
  withIgv,
  isPlanId,
} from './plans.catalog';

describe('plans.catalog (HU40)', () => {
  it('trimestral = mensual×3×0,95 redondeado y anual = mensual×10 (C3)', () => {
    for (const id of PLAN_IDS) {
      for (const c of ['PEN', 'USD'] as const) {
        const m = PLANS[id].monthly?.[c];
        if (m == null) {
          expect(priceFor(id, 'monthly', c)).toBeNull();
          continue;
        }
        expect(priceFor(id, 'monthly', c)).toBe(m);
        expect(priceFor(id, 'quarterly', c)).toBe(Math.round(m * 3 * 0.95));
        expect(priceFor(id, 'annual', c)).toBe(m * 10);
      }
    }
    expect(priceFor('crece', 'quarterly', 'PEN')).toBe(710);
    expect(priceFor('inicia', 'annual', 'PEN')).toBe(990);
  });

  it('precios del benchmark', () => {
    expect(PLANS.inicia.monthly).toEqual({ PEN: 99, USD: 29 });
    expect(PLANS.crece.monthly).toEqual({ PEN: 249, USD: 79 });
    expect(PLANS.escala.monthly).toEqual({ PEN: 549, USD: 169 });
    expect(PLANS.empresa.monthly).toBeNull();
  });

  it('catálogo público: 4 planes, 2 monedas, 3 periodos y límites (C1)', () => {
    const cat = publicCatalog();
    expect(cat.plans.map((p) => p.id)).toEqual([
      'inicia',
      'crece',
      'escala',
      'empresa',
    ]);
    const crece = cat.plans[1];
    expect(Object.keys(crece.prices.PEN!)).toEqual([
      'monthly',
      'quarterly',
      'annual',
    ]);
    expect(crece.prices.USD!.annual).toBe(790);
    expect(crece.limits.users).toBe(5);
    expect(cat.plans[3].prices.PEN).toBeNull();
    expect(cat.plans[3].custom).toBe(true);
  });

  it('los planes superiores incluyen las funciones de los inferiores', () => {
    for (const f of PLANS.crece.features)
      expect(PLANS.escala.features).toContain(f);
  });

  it('IGV y validación de id', () => {
    expect(withIgv(249)).toBe(293.82);
    expect(isPlanId('crece')).toBe(true);
    expect(isPlanId('pro')).toBe(false);
  });
});
