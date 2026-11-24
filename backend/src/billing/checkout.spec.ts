import { isValidRuc } from './ruc';
import { quoteFor } from './checkout.service';

describe('Checkout (HU46)', () => {
  it('C2: valida el dígito verificador del RUC', () => {
    expect(isValidRuc('20123456786')).toBe(true);
    expect(isValidRuc('20100070970')).toBe(true);
    expect(isValidRuc('20123456789')).toBe(false);
    expect(isValidRuc('30123456786')).toBe(false);
    expect(isValidRuc('2012345678')).toBe(false);
  });

  it('C1: IGV desglosado en soles y sin IGV en dólares', () => {
    expect(quoteFor('inicia', 'monthly', 'PEN')).toMatchObject({
      subtotal: 99,
      igv: 17.82,
      total: 116.82,
      mode: 'subscription',
    });
    expect(quoteFor('crece', 'annual', 'PEN')).toMatchObject({
      subtotal: 2490,
      igv: 448.2,
      total: 2938.2,
      mode: 'one_time',
    });
    expect(quoteFor('inicia', 'quarterly', 'USD')).toMatchObject({
      subtotal: 83,
      igv: 0,
      total: 83,
    });
  });

  it('Empresa no se compra en línea', () => {
    expect(() => quoteFor('empresa', 'monthly', 'PEN')).toThrow();
  });
});
