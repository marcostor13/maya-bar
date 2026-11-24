import {
  base32Decode,
  base32Encode,
  generateBackupCodes,
  generateSecret,
  hashBackupCode,
  hotp,
  otpauthUrl,
  verifyTotp,
} from './totp';

// Secreto del RFC 6238 (ASCII "12345678901234567890").
const RFC = base32Encode(Buffer.from('12345678901234567890'));

describe('totp (HU62)', () => {
  it('coincide con los vectores del RFC 6238 (SHA-1, 6 dígitos)', () => {
    // T = 59 s → 94287082; 1111111109 s → 07081804; 1234567890 s → 89005924.
    expect(hotp(RFC, Math.floor(59 / 30))).toBe('287082');
    expect(hotp(RFC, Math.floor(1111111109 / 30))).toBe('081804');
    expect(hotp(RFC, Math.floor(1234567890 / 30))).toBe('005924');
  });

  it('acepta ±1 paso y rechaza otros o formatos raros', () => {
    const now = 1_764_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(RFC, hotp(RFC, step), now)).toBe(step);
    expect(verifyTotp(RFC, hotp(RFC, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC, hotp(RFC, step + 2), now)).toBeNull();
    expect(verifyTotp(RFC, '12345', now)).toBeNull();
    expect(verifyTotp(RFC, 'abcdef', now)).toBeNull();
  });

  it('base32 ida y vuelta, secretos y códigos de respaldo', () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(hashBackupCode(codes[0].toUpperCase().replace('-', ' '))).toBe(
      hashBackupCode(codes[0]),
    );
    expect(otpauthUrl(s, 'ana@x.pe')).toContain(`secret=${s}`);
  });
});
