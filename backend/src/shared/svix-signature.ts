import { createHmac, timingSafeEqual } from 'crypto';

/** Tolerancia de reloj para la marca de tiempo del webhook (5 minutos). */
const TOLERANCE_S = 5 * 60;

/**
 * Verifica la firma Svix con la que Resend envía sus webhooks:
 * HMAC-SHA256 en base64 de `${id}.${timestamp}.${cuerpo}` con la clave
 * `whsec_<base64>`. La cabecera puede traer varias firmas (`v1,xxx v1,yyy`).
 */
export function verifySvixSignature(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  rawBody: Buffer | string | undefined,
  now = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature || rawBody === undefined)
    return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > TOLERANCE_S)
    return false;
  let key: Buffer;
  try {
    key = Buffer.from(
      secret.startsWith('whsec_') ? secret.slice(6) : secret,
      'base64',
    );
  } catch {
    return false;
  }
  if (!key.length) return false;
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest();
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/** Firma un cuerpo como lo haría Svix (para pruebas y para el botón de prueba). */
export function signSvix(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
): string {
  const key = Buffer.from(
    secret.startsWith('whsec_') ? secret.slice(6) : secret,
    'base64',
  );
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}
