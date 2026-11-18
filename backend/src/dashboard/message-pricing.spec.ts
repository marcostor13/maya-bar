import { waCost, waMarket, WA_RATES } from './message-pricing';

describe('message-pricing (HU18 C1)', () => {
  it.each([
    ['+51 999 888 777', 'Perú'],
    ['18095551234', 'Resto de Latinoamérica'],
    ['12125551234', 'Norteamérica'],
    ['79161234567', 'Rusia'],
    ['5491112345678', 'Argentina'],
    ['35312345678', 'Resto de Europa occidental'],
    ['999', 'Otros'],
    ['', 'Otros'],
  ])('%s → %s', (phone, market) => {
    expect(waMarket(phone)).toBe(market);
  });

  it('precio por categoría; lo no regular vale 0', () => {
    expect(waCost('51999', 'marketing', 'regular')).toBe(0.0703);
    expect(waCost('51999', 'utility', 'regular')).toBe(0.03);
    expect(waCost('51999', 'service', 'regular')).toBe(0.03);
    expect(waCost('51999', 'authentication', 'regular')).toBe(0.03);
    expect(waCost('91999', 'authentication-international', 'regular')).toBe(
      0.0304,
    );
    // Sin tarifa internacional publicada se usa la de autenticación.
    expect(waCost('51999', 'authentication-international', 'regular')).toBe(
      0.03,
    );
    expect(waCost('51999', 'marketing', 'free_customer_service')).toBe(0);
    expect(waCost('51999', 'marketing', 'free_entry_point')).toBe(0);
    expect(waCost('51999', 'group_marketing', 'regular')).toBe(0);
  });

  it('todas las regiones tienen las tres tarifas básicas', () => {
    for (const r of Object.values(WA_RATES))
      for (const v of r.slice(0, 3)) expect(typeof v).toBe('number');
  });
});
