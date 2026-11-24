/**
 * Mismo cálculo que el backend (`backend/src/quotes/quote-calc.ts`, HU68):
 * cada línea se redondea a céntimos y luego se suma. Solo sirve para ver los
 * totales mientras se edita; los que valen son los que guarda el servidor.
 */
export interface LineInput {
  quantity: number;
  unitPrice: number;
  discountPct?: number;
  taxIncluded?: boolean;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeQuote(items: LineInput[], igvRate = 18) {
  const rate = Math.max(0, igvRate) / 100;
  const lines = items.map((it) => {
    const gross = Math.max(0, Number(it.quantity) || 0) * Math.max(0, Number(it.unitPrice) || 0);
    const pct = Math.min(100, Math.max(0, Number(it.discountPct) || 0));
    const discount = r2((gross * pct) / 100);
    const net = r2(gross - discount);
    if (it.taxIncluded && rate > 0) {
      const base = r2(net / (1 + rate));
      return { base, igv: r2(net - base), total: net, discount };
    }
    const igv = r2(net * rate);
    return { base: net, igv, total: r2(net + igv), discount };
  });
  const sum = (k: 'base' | 'igv' | 'total' | 'discount') => r2(lines.reduce((a, l) => a + l[k], 0));
  return { lines, subtotal: sum('base'), discount: sum('discount'), igv: sum('igv'), total: sum('total') };
}
