import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';

/**
 * TOTP (RFC 6238) compatible con Google Authenticator, Microsoft Authenticator,
 * 1Password, Authy…: SHA-1, 6 dígitos, pasos de 30 s. Sin dependencias.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_S = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Secreto base32 no válido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secreto nuevo de 160 bits en base32. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Código del paso `step` (contador de 30 s). */
export function hotp(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function stepAt(now: number): number {
  return Math.floor(now / 1000 / STEP_S);
}

/**
 * Paso con el que coincide el código (±1 paso por desfase de reloj), o `null`.
 * Quien llama guarda el último paso usado para que el mismo código no sirva dos veces.
 */
export function verifyTotp(
  secret: string,
  code: string,
  now = Date.now(),
  window = 1,
): number | null {
  const c = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const current = stepAt(now);
  for (let d = -window; d <= window; d++) {
    const step = current + d;
    const a = Buffer.from(hotp(secret, step));
    const b = Buffer.from(c);
    if (a.length === b.length && timingSafeEqual(a, b)) return step;
  }
  return null;
}

/** URL `otpauth://` que se muestra como QR. */
export function otpauthUrl(
  secret: string,
  account: string,
  issuer = 'Maya CRM',
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_S}`;
}

/** Códigos de respaldo legibles: `xxxx-xxxx` sin caracteres confusos. */
export function generateBackupCodes(n = 10): string[] {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: n }, () => {
    let s = '';
    for (let i = 0; i < 8; i++) s += chars[randomInt(chars.length)];
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

export function normalizeBackupCode(code: string): string {
  return String(code ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function hashBackupCode(code: string): string {
  return createHash('sha256')
    .update(`backup:${normalizeBackupCode(code)}`)
    .digest('hex');
}
