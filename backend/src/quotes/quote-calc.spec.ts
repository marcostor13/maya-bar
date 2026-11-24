import { computeQuote } from './quote-calc';

describe('computeQuote (HU68 C1)', () => {
  it('precio con IGV incluido: separa la base y el IGV', () => {
    const t = computeQuote([
      { quantity: 2, unitPrice: 118, taxIncluded: true },
    ]);
    expect(t).toMatchObject({
      subtotal: 200,
      igv: 36,
      total: 236,
      discount: 0,
    });
  });

  it('precio sin IGV: lo suma encima', () => {
    const t = computeQuote([
      { quantity: 3, unitPrice: 100, taxIncluded: false },
    ]);
    expect(t).toMatchObject({ subtotal: 300, igv: 54, total: 354 });
  });

  it('descuento por línea y mezcla de líneas; redondea por línea', () => {
    const t = computeQuote([
      { quantity: 1, unitPrice: 1000, discountPct: 10, taxIncluded: false },
      { quantity: 3, unitPrice: 9.99, taxIncluded: true },
    ]);
    // Línea 1: 900 + 162 = 1062. Línea 2: 29.97 → base 25.40, IGV 4.57.
    expect(t.lines[0]).toEqual({
      base: 900,
      igv: 162,
      total: 1062,
      discount: 100,
    });
    expect(t.lines[1]).toEqual({
      base: 25.4,
      igv: 4.57,
      total: 29.97,
      discount: 0,
    });
    expect(t).toMatchObject({
      subtotal: 925.4,
      igv: 166.57,
      total: 1091.97,
      discount: 100,
    });
    expect(t.subtotal + t.igv).toBeCloseTo(t.total, 2);
  });

  it('empresa exonerada (IGV 0) y valores inválidos no rompen', () => {
    expect(
      computeQuote([{ quantity: 2, unitPrice: 50, taxIncluded: true }], 0),
    ).toMatchObject({
      subtotal: 100,
      igv: 0,
      total: 100,
    });
    expect(computeQuote([{ quantity: -1, unitPrice: NaN }]).total).toBe(0);
    expect(computeQuote([]).total).toBe(0);
  });
});
