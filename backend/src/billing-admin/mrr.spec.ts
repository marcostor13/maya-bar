import { computeMrr, monthlyEquivalent } from './mrr';

describe('MRR (HU57 C1)', () => {
  it('normaliza mensual, trimestral y anual a mensual y suma por moneda', () => {
    const r = computeMrr([
      {
        plan: 'crece',
        subscription: {
          status: 'active',
          period: 'monthly',
          currency: 'PEN',
          amount: 249,
        },
      },
      {
        plan: 'crece',
        subscription: {
          status: 'active',
          period: 'quarterly',
          currency: 'PEN',
          amount: 710,
        },
      },
      {
        plan: 'escala',
        subscription: {
          status: 'active',
          period: 'annual',
          currency: 'PEN',
          amount: 5490,
        },
      },
      {
        plan: 'inicia',
        subscription: {
          status: 'active',
          period: 'annual',
          currency: 'USD',
          amount: 290,
        },
      },
    ]);
    // 249 + 710/3 + 5490/12 = 249 + 236.666… + 457.5
    expect(r.total.PEN).toBe(943.17);
    expect(r.total.USD).toBe(24.17);
    expect(r.byPlan.find((p) => p.plan === 'crece')).toEqual({
      plan: 'crece',
      count: 2,
      mrr: { PEN: 485.67, USD: 0 },
    });
  });

  it('no cuenta pruebas, impagos, canceladas ni montos vacíos', () => {
    for (const status of ['trialing', 'past_due', 'canceled', 'expired'])
      expect(
        monthlyEquivalent({
          subscription: {
            status,
            period: 'monthly',
            currency: 'PEN',
            amount: 99,
          },
        }),
      ).toBe(0);
    expect(
      monthlyEquivalent({
        subscription: { status: 'active', period: 'monthly' },
      }),
    ).toBe(0);
    expect(monthlyEquivalent({})).toBe(0);
    expect(computeMrr([]).total).toEqual({ PEN: 0, USD: 0 });
  });
});
