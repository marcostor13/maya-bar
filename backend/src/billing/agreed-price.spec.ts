import { agreedPrice } from './agreed-price';

describe('agreedPrice (HU53 + HU54)', () => {
  const at = new Date('2026-11-24T12:00:00Z');
  it('plan con descuento vigente más add-ons', () => {
    const t = {
      addonItems: { extra_user: 1 },
      subscription: {
        discount: { code: 'F', type: 'percent' as const, value: 30 },
      },
    };
    expect(agreedPrice(t, 'crece', 'annual', 'PEN', at)).toBe(1743 + 39 * 12);
  });
  it('un cupón limitado a un plan o periodo no descuenta en otro', () => {
    const t = {
      subscription: {
        discount: {
          code: 'C',
          type: 'percent' as const,
          value: 50,
          plans: ['crece'],
          periods: ['annual'],
        },
      },
    };
    expect(agreedPrice(t, 'crece', 'annual', 'PEN', at)).toBe(1245);
    expect(agreedPrice(t, 'escala', 'annual', 'PEN', at)).toBe(5490);
    expect(agreedPrice(t, 'crece', 'monthly', 'PEN', at)).toBe(249);
  });
});
