/** IGV de Perú por defecto. */
export const IGV_RATE = 18;

export interface QuoteLineInput {
  quantity: number;
  unitPrice: number;
  /** Descuento de la línea, en %. */
  discountPct?: number;
  /** El precio unitario ya incluye el IGV. */
  taxIncluded?: boolean;
}

export interface QuoteLineTotals {
  /** Importe sin IGV, tras el descuento. */
  base: number;
  igv: number;
  total: number;
  /** Descuento aplicado, en la misma moneda que el precio escrito. */
  discount: number;
}

export interface QuoteTotals {
  lines: QuoteLineTotals[];
  /** Suma de las bases (sin IGV). */
  subtotal: number;
  discount: number;
  igv: number;
  total: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Totales de una cotización (HU68). Cada línea se redondea a céntimos y luego
 * se suma, como en un comprobante: así el PDF cuadra línea a línea.
 * Con `igvRate` 0 (empresa exonerada) el total es la base.
 */
export function computeQuote(
  items: QuoteLineInput[],
  igvRate = IGV_RATE,
): QuoteTotals {
  const rate = Math.max(0, igvRate) / 100;
  const lines = items.map((it) => {
    const qty = Math.max(0, Number(it.quantity) || 0);
    const price = Math.max(0, Number(it.unitPrice) || 0);
    const pct = Math.min(100, Math.max(0, Number(it.discountPct) || 0));
    const gross = qty * price;
    const discount = r2((gross * pct) / 100);
    const net = r2(gross - discount);
    if (it.taxIncluded && rate > 0) {
      const base = r2(net / (1 + rate));
      return { base, igv: r2(net - base), total: net, discount };
    }
    const igv = r2(net * rate);
    return { base: net, igv, total: r2(net + igv), discount };
  });
  const sum = (k: keyof QuoteLineTotals) =>
    r2(lines.reduce((a, l) => a + l[k], 0));
  return {
    lines,
    subtotal: sum('base'),
    discount: sum('discount'),
    igv: sum('igv'),
    total: sum('total'),
  };
}
