import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit:action';

export interface AuditRequest {
  user?: {
    userId?: string;
    email?: string;
    role?: string;
    tenantId?: string | null;
  };
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  /** Lo que el controlador quiera añadir al registro (p. ej. cuántas filas exportó). */
  auditDetails?: Record<string, unknown>;
}

export interface AuditOptions {
  action: string;
  resource?: string;
  /** Parámetro de ruta con el id del recurso (por defecto `id`). */
  idParam?: string;
  /**
   * Parámetro con la empresa afectada cuando quien actúa es el superadmin
   * (p. ej. `id` en `/admin/tenants/:id/...`), para que la empresa lo vea.
   */
  tenantParam?: string;
  /** Campos del body que se copian al detalle (nunca sensibles: se filtran igual). */
  bodyFields?: string[];
  /** Resumen a partir de la petición y la respuesta. */
  details?: (
    req: AuditRequest,
    result: unknown,
  ) => Record<string, unknown> | undefined;
}

/** Registra la acción en la auditoría cuando la ruta termina bien (HU63). */
export const Audit = (opts: AuditOptions | string) =>
  SetMetadata(AUDIT_KEY, typeof opts === 'string' ? { action: opts } : opts);

/** Campos numéricos de primer nivel de una respuesta (p. ej. el resumen de una importación). */
export function pickNumbers(res: unknown): Record<string, number> {
  if (!res || typeof res !== 'object') return {};
  return Object.fromEntries(
    Object.entries(res as Record<string, unknown>).filter(
      ([, v]) => typeof v === 'number',
    ),
  ) as Record<string, number>;
}
