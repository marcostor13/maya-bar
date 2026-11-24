import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { limaDate } from './invoice-provider';
import type {
  InvoiceLine,
  InvoiceProvider,
  InvoiceRequest,
  IssuedReceipt,
} from './invoice-provider';

const TYPE_CODE: Record<InvoiceRequest['type'], number> = {
  '01': 1,
  '03': 2,
  '07': 3,
};

const ddmmyyyy = (d: Date) => {
  const { dd, mm, yyyy } = limaDate(d);
  return `${dd}-${mm}-${yyyy}`;
};

interface NubefactResponse {
  enlace_del_pdf?: string;
  enlace_del_xml?: string;
  enlace_del_cdr?: string;
  aceptada_por_sunat?: boolean;
  errors?: string;
  codigo?: number;
}

/**
 * Nubefact (API JSON, https://www.nubefact.com/integracion). Se configura con
 * `NUBEFACT_URL` (la "RUTA" de tu cuenta) y `NUBEFACT_TOKEN`.
 */
@Injectable()
export class NubefactProvider implements InvoiceProvider {
  readonly name = 'nubefact';
  private readonly logger = new Logger(NubefactProvider.name);

  constructor(private config: ConfigService) {}

  configured(): boolean {
    return !!(this.url() && this.token());
  }

  private url() {
    return this.config.get<string>('NUBEFACT_URL') || '';
  }

  private token() {
    return this.config.get<string>('NUBEFACT_TOKEN') || '';
  }

  /** Cuerpo de Nubefact para un comprobante. Exportado para las pruebas. */
  static body(req: InvoiceRequest): Record<string, unknown> {
    const tipoIgv = req.export ? 16 : 1; // 16 = exportación, 1 = gravado
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const lines: InvoiceLine[] = req.lines?.length
      ? req.lines
      : [
          {
            description: req.description,
            base: req.base,
            igv: req.igv,
            total: req.total,
            discount: req.discount,
          },
        ];
    // Con descuento (HU54/HU55): valor de lista y descuento de línea; el subtotal no cambia.
    const items = lines.map((l) => {
      const value = req.export ? l.total : l.base;
      const discount = l.discount && l.discount > 0 ? l.discount : 0;
      const list = round2(value + discount);
      return {
        unidad_de_medida: 'ZZ',
        codigo: 'MAYA',
        descripcion: l.description,
        cantidad: 1,
        valor_unitario: discount ? list : value,
        precio_unitario: discount
          ? req.export
            ? list
            : round2(list * 1.18)
          : l.total,
        ...(discount ? { descuento: discount } : {}),
        subtotal: value,
        tipo_de_igv: tipoIgv,
        igv: req.export ? 0 : l.igv,
        total: l.total,
        anticipo_regularizacion: false,
      };
    });
    const discount = round2(lines.reduce((n, l) => n + (l.discount ?? 0), 0));
    return {
      operacion: 'generar_comprobante',
      tipo_de_comprobante: TYPE_CODE[req.type],
      serie: req.series,
      numero: req.number,
      sunat_transaction: req.export ? 2 : 1,
      cliente_tipo_de_documento: req.customer.docType,
      cliente_numero_de_documento: req.customer.docNumber || '-',
      cliente_denominacion: req.customer.name,
      cliente_direccion: req.customer.address ?? '',
      cliente_email: req.customer.email ?? '',
      fecha_de_emision: ddmmyyyy(req.issueDate),
      moneda: req.currency === 'USD' ? 2 : 1,
      porcentaje_de_igv: 18.0,
      total_gravada: req.export ? '' : req.base,
      total_exportacion: req.export ? req.total : '',
      total_igv: req.export ? 0 : req.igv,
      total: req.total,
      ...(discount ? { total_descuento: discount } : {}),
      enviar_automaticamente_a_la_sunat: true,
      enviar_automaticamente_al_cliente: false,
      ...(req.refersTo
        ? {
            documento_que_se_modifica_tipo: TYPE_CODE[req.refersTo.type],
            documento_que_se_modifica_serie: req.refersTo.series,
            documento_que_se_modifica_numero: req.refersTo.number,
            tipo_de_nota_de_credito: 6, // devolución total
          }
        : {}),
      items,
    };
  }

  private async call(body: Record<string, unknown>): Promise<NubefactResponse> {
    const res = await fetch(this.url(), {
      method: 'POST',
      headers: {
        Authorization: `Token token="${this.token()}"`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as NubefactResponse;
    if (!res.ok || data.errors)
      throw new Error(
        `Nubefact ${res.status}: ${String(data.errors ?? 'sin detalle').slice(0, 300)}`,
      );
    return data;
  }

  private static toIssued(d: NubefactResponse): IssuedReceipt {
    return {
      pdfUrl: d.enlace_del_pdf,
      xmlUrl: d.enlace_del_xml,
      cdrUrl: d.enlace_del_cdr,
      acceptedBySunat: d.aceptada_por_sunat,
    };
  }

  async issue(req: InvoiceRequest): Promise<IssuedReceipt> {
    return NubefactProvider.toIssued(
      await this.call(NubefactProvider.body(req)),
    );
  }

  async find(
    req: Pick<InvoiceRequest, 'type' | 'series' | 'number'>,
  ): Promise<IssuedReceipt | null> {
    try {
      return NubefactProvider.toIssued(
        await this.call({
          operacion: 'consultar_comprobante',
          tipo_de_comprobante: TYPE_CODE[req.type],
          serie: req.series,
          numero: req.number,
        }),
      );
    } catch (err) {
      this.logger.warn(`Consulta ${req.series}-${req.number}: ${String(err)}`);
      return null;
    }
  }
}
