import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Comprueba la cabecera `X-Hub-Signature-256` de un webhook de Meta: HMAC-SHA256
 * del cuerpo CRUDO (no del JSON re-serializado) con el secreto de la app.
 */
export function verifyMetaSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(header.slice('sha256='.length), 'hex');
  } catch {
    return false;
  }
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

/** Firma un cuerpo como lo haría Meta (pruebas y herramientas). */
export function signMetaBody(body: string | Buffer, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

/** Teléfono para logs: deja ver el prefijo y los 3 últimos dígitos. */
export function maskPhone(phone: string | undefined | null): string {
  if (!phone) return '?';
  const digits = String(phone);
  if (digits.length <= 6) return '***';
  return `${digits.slice(0, 3)}***${digits.slice(-3)}`;
}
