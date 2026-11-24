import { prorate } from './plans.catalog';

/** HU52 C1: diferencia prorrateada al subir de plan. */
describe('prorate (HU52)', () => {
  const end = new Date('2026-12-01T12:00:00Z');

  it('a mitad de un mes de 30 días cobra la mitad de la diferencia', () => {
    // Noviembre: 30 días; quedan 15.
    expect(
      prorate({
        oldAmount: 99,
        newAmount: 249,
        period: 'monthly',
        periodEnd: end,
        now: new Date('2026-11-16T12:00:00Z'),
      }),
    ).toBe(75);
  });

  it('el último día cobra casi nada y vencido nada', () => {
    expect(
      prorate({
        oldAmount: 99,
        newAmount: 249,
        period: 'monthly',
        periodEnd: end,
        now: new Date('2026-11-30T12:00:00Z'),
      }),
    ).toBe(5);
    expect(
      prorate({
        oldAmount: 99,
        newAmount: 249,
        period: 'monthly',
        periodEnd: end,
        now: new Date('2026-12-02T00:00:00Z'),
      }),
    ).toBe(0);
  });

  it('al empezar el periodo cobra la diferencia completa', () => {
    expect(
      prorate({
        oldAmount: 990,
        newAmount: 2490,
        period: 'annual',
        periodEnd: end,
        now: new Date('2025-12-01T12:00:00Z'),
      }),
    ).toBe(1500);
  });

  it('bajar nunca da monto negativo', () => {
    expect(
      prorate({
        oldAmount: 249,
        newAmount: 99,
        period: 'monthly',
        periodEnd: end,
        now: new Date('2026-11-16T12:00:00Z'),
      }),
    ).toBe(0);
  });
});
