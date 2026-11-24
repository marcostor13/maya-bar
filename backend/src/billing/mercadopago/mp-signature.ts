import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Valida la cabecera `x-signature` de Mercado Pago (HU45):
 * `ts=<epoch>,v1=<hmac-hex>` firmado con el secreto del webhook sobre
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. Las partes ausentes se
 * omiten del manifiesto, como indica la documentación de Mercado Pago.
 */
export function verifyMpSignature(opts: {
  signature: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
  secret: string | undefined;
}): boolean {
  const { signature, requestId, secret } = opts;
  if (!signature || !secret) return false;
  const parts = Object.fromEntries(
    signature.split(',').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k, v.join('=')];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;
  // Los ids alfanuméricos se firman en minúsculas.
  const dataId = opts.dataId ? opts.dataId.toLowerCase() : undefined;
  let manifest = '';
  if (dataId) manifest += `id:${dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Firma de prueba (e2e y unitarias). */
export function signMp(
  dataId: string,
  requestId: string,
  secret: string,
  ts = Date.now(),
): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`;
}
