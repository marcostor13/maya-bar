import { formatPhone, normalizePhone, phoneDigits } from './phone';

describe('normalizePhone', () => {
  it('asume Perú cuando llegan nueve dígitos sueltos', () => {
    expect(formatPhone('999888777')).toBe('+51 999 888 777');
  });

  it('respeta el prefijo internacional que ya trae', () => {
    expect(formatPhone('+51999888777')).toBe('+51 999 888 777');
    expect(formatPhone('+1 415 555 2671')).toBe('+1 415 555 2671');
    expect(formatPhone('+34 600 123 456')).toBe('+34 600 123 456');
  });

  it('entiende los once dígitos que ya empiezan por 51', () => {
    expect(formatPhone('51999888777')).toBe('+51 999 888 777');
  });

  it('limpia separadores, paréntesis y espacios', () => {
    expect(formatPhone('(999) 888-777')).toBe('+51 999 888 777');
    expect(formatPhone(' 999 888 777 ')).toBe('+51 999 888 777');
    expect(formatPhone('999.888.777')).toBe('+51 999 888 777');
  });

  it('quita el prefijo de salida internacional', () => {
    expect(formatPhone('0051999888777')).toBe('+51 999 888 777');
    expect(formatPhone('051999888777')).toBe('+51 999 888 777');
  });

  it('deja los dígitos que necesita WhatsApp', () => {
    expect(phoneDigits('999 888 777')).toBe('51999888777');
    expect(phoneDigits('+51 999 888 777')).toBe('51999888777');
  });

  it('es idempotente: renormalizar no cambia nada', () => {
    const once = formatPhone('999888777')!;
    expect(formatPhone(once)).toBe(once);
  });

  it('descarta lo que no es un teléfono', () => {
    expect(normalizePhone('')).toBeUndefined();
    expect(normalizePhone('   ')).toBeUndefined();
    expect(normalizePhone(null)).toBeUndefined();
    expect(normalizePhone(undefined)).toBeUndefined();
    expect(normalizePhone('sin teléfono')).toBeUndefined();
    expect(normalizePhone('12345')).toBeUndefined();
    expect(normalizePhone('9999999999999999999')).toBeUndefined();
  });

  it('agrupa juntando el último dígito suelto', () => {
    // 10 dígitos nacionales: 3 + 3 + 4 en vez de 3 + 3 + 3 + 1.
    expect(formatPhone('+14155552671')).toBe('+1 415 555 2671');
  });

  it('distintas escrituras del mismo número colapsan en una sola', () => {
    const variants = ['999888777', '+51999888777', '51 999 888 777', '(+51) 999-888-777'];
    const normalized = new Set(variants.map((v) => formatPhone(v)));
    expect(normalized.size).toBe(1);
    expect([...normalized][0]).toBe('+51 999 888 777');
  });
});
