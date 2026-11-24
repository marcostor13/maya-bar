/** Comprobante a emitir, independiente del proveedor (HU49). */
/** Una línea del comprobante; montos ya redondeados. */
export interface InvoiceLine {
  description: string;
  base: number;
  igv: number;
  total: number;
  /** Descuento de la línea, sin IGV. */
  discount?: number;
}

export interface InvoiceRequest {
  /** 01 factura, 03 boleta, 07 nota de crédito. */
  type: '01' | '03' | '07';
  series: string;
  number: number;
  issueDate: Date;
  currency: 'PEN' | 'USD';
  customer: {
    /** 6 RUC, 1 DNI, '-' sin documento (boleta < S/ 700). */
    docType: '6' | '1' | '-';
    docNumber: string;
    name: string;
    address?: string;
    email?: string;
  };
  /** Base imponible, IGV y total, ya redondeados a céntimos. */
  base: number;
  igv: number;
  total: number;
  /** Exportación de servicios: sin IGV (pagos en dólares desde fuera). */
  export?: boolean;
  description: string;
  /** Descuento por cupón (HU54), sin IGV: la línea va a precio de lista menos esto. */
  discount?: number;
  /**
   * Varias líneas (HU55: plan e implementación). Si están, los totales del
   * comprobante son su suma; si no, hay una sola línea con `description`.
   */
  lines?: InvoiceLine[];
  /** Nota de crédito: comprobante que modifica. */
  refersTo?: { type: '01' | '03'; series: string; number: number };
}

export interface IssuedReceipt {
  pdfUrl?: string;
  xmlUrl?: string;
  cdrUrl?: string;
  acceptedBySunat?: boolean;
}

/**
 * PSE/OSE que emite ante SUNAT. Nubefact por defecto; cualquier otro se
 * enchufa implementando esta interfaz.
 */
export interface InvoiceProvider {
  readonly name: string;
  configured(): boolean;
  issue(req: InvoiceRequest): Promise<IssuedReceipt>;
  /** Consulta uno ya enviado (reintento tras un corte a mitad). */
  find(
    req: Pick<InvoiceRequest, 'type' | 'series' | 'number'>,
  ): Promise<IssuedReceipt | null>;
}

export const INVOICE_PROVIDER = Symbol('INVOICE_PROVIDER');

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Del total cobrado (IGV incluido) a base + IGV, cuadrando céntimos (C1). */
export function splitIgv(
  total: number,
  rate = 0.18,
): { base: number; igv: number; total: number } {
  const base = round2(total / (1 + rate));
  return { base, igv: round2(total - base), total: round2(total) };
}

/** Día, mes y año en hora de Lima: el servidor suele estar en UTC (H2). */
export function limaDate(d: Date): { dd: string; mm: string; yyyy: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { dd: get('day'), mm: get('month'), yyyy: get('year') };
}
