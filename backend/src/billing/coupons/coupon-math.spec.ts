import { discountAmount, discounted, discountEndsAt } from './coupon-math';

describe('coupon-math (HU54)', () => {
  it('C1: 30 % de Crece anual (2.490) deja 1.743', () => {
    expect(discountAmount({ type: 'percent', value: 30 }, 2490)).toBe(747);
    expect(
      discounted(2490, { code: 'FUNDADOR', type: 'percent', value: 30 }),
    ).toBe(1743);
  });

  it('un monto fijo nunca deja el precio en negativo', () => {
    expect(discountAmount({ type: 'fixed', value: 500 }, 99)).toBe(99);
    expect(discounted(99, { code: 'X', type: 'fixed', value: 20 })).toBe(79);
  });

  it('un descuento vencido ya no aplica', () => {
    const d = {
      code: 'X',
      type: 'percent' as const,
      value: 50,
      endsAt: new Date('2026-01-01T12:00:00Z'),
    };
    expect(discounted(100, d, new Date('2025-12-31T12:00:00Z'))).toBe(50);
    expect(discounted(100, d, new Date('2026-01-02T12:00:00Z'))).toBe(100);
  });

  it('duración: una vez = primer periodo, N meses desde hoy, de por vida sin fin', () => {
    const end = new Date('2027-11-24T12:00:00Z');
    const now = new Date('2026-11-24T12:00:00Z');
    expect(discountEndsAt({ duration: 'once' }, end, now)).toEqual(end);
    expect(
      discountEndsAt(
        { duration: 'months', durationMonths: 3 },
        end,
        now,
      )!.getUTCMonth(),
    ).toBe(1);
    expect(discountEndsAt({ duration: 'forever' }, end, now)).toBeUndefined();
  });
});
