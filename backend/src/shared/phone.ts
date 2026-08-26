/**
 * Normalización de teléfonos a un único formato de almacenamiento:
 * `+51 999 999 999` (prefijo internacional + número agrupado de tres en tres).
 *
 * Los espacios son solo presentación: todos los puntos de envío de WhatsApp
 * pasan por `WhatsAppService.formatPhone`, que deja únicamente los dígitos
 * (`51999999999`), que es lo que aceptan tanto WAHA (`<digitos>@c.us`) como la
 * Cloud API de Meta. Por eso guardar el número formateado es seguro.
 */

/** País que se asume cuando el número llega sin prefijo internacional. */
export const DEFAULT_COUNTRY_CODE = '51';

/**
 * Prefijos que se reconocen para separar el país del número nacional. Se
 * comprueban de más largo a más corto. No es la lista E.164 completa: cubre
 * América y los países europeos con presencia real; para el resto se asume un
 * prefijo de dos dígitos, que solo afecta a dónde cae un espacio.
 */
const COUNTRY_CODES = [
  // Tres dígitos
  '297', '298', '299',
  '350', '351', '352', '353', '354', '355', '356', '357', '358', '359',
  '370', '371', '372', '373', '374', '375', '376', '377', '378', '380',
  '381', '382', '383', '385', '386', '387', '389',
  '420', '421', '423',
  '500', '501', '502', '503', '504', '505', '506', '507', '508', '509',
  '590', '591', '592', '593', '594', '595', '596', '597', '598', '599',
  '852', '853', '855', '856', '880', '886',
  '960', '961', '962', '963', '964', '965', '966', '967', '968',
  '970', '971', '972', '973', '974', '975', '976', '977',
  // Dos dígitos
  '20', '27', '30', '31', '32', '33', '34', '36', '39',
  '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '55', '56', '57', '58',
  '60', '61', '62', '63', '64', '65', '66',
  '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
  // Un dígito
  '7', '1',
];

/** Longitudes válidas en E.164: hasta 15 dígitos contando el prefijo. */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/** Longitud del número nacional peruano (móviles y fijos con prefijo). */
const PERU_NATIONAL_LENGTH = 9;

export interface NormalizedPhone {
  /** Cómo se guarda y se muestra: `+51 999 999 999`. */
  display: string;
  /** Solo dígitos, tal como lo necesita WhatsApp: `51999999999`. */
  digits: string;
}

/**
 * Devuelve el teléfono normalizado, o `undefined` si no hay número aprovechable.
 *
 * - Con prefijo internacional (`+`, `00`) se respeta el país que trae.
 * - Con nueve dígitos sueltos se asume Perú, según la convención del negocio.
 * - Con once dígitos que empiezan por 51 se entiende que ya trae el prefijo.
 */
export function normalizePhone(raw: unknown): NormalizedPhone | undefined {
  if (raw === null || raw === undefined) return undefined;
  const text = String(raw).trim();
  if (!text) return undefined;

  const hasPlus = text.startsWith('+');
  let digits = text.replace(/\D/g, '');
  if (!digits) return undefined;

  // `00` es el prefijo de salida internacional en buena parte del mundo.
  const hasIntlPrefix = hasPlus || /^00\d/.test(digits);
  if (!hasPlus && digits.startsWith('00')) digits = digits.slice(2);

  if (!hasIntlPrefix) {
    if (digits.length === PERU_NATIONAL_LENGTH) {
      digits = DEFAULT_COUNTRY_CODE + digits;
    } else if (
      digits.length === PERU_NATIONAL_LENGTH + 3 &&
      digits.startsWith('0' + DEFAULT_COUNTRY_CODE)
    ) {
      // `051999999999`: prefijo de salida antiguo pegado al país.
      digits = digits.slice(1);
    }
  }

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return undefined;

  const code = countryCodeOf(digits);
  const national = digits.slice(code.length);
  return { display: `+${code} ${groupDigits(national)}`.trim(), digits };
}

/** Solo los dígitos, que es lo que consumen WhatsApp y las claves de deduplicado. */
export function phoneDigits(raw: unknown): string | undefined {
  return normalizePhone(raw)?.digits;
}

/** Formato de almacenamiento, o `undefined` si el número no es aprovechable. */
export function formatPhone(raw: unknown): string | undefined {
  return normalizePhone(raw)?.display;
}

function countryCodeOf(digits: string): string {
  const match = COUNTRY_CODES.find((code) => digits.startsWith(code));
  // Prefijo desconocido: dos dígitos es la longitud más común.
  return match ?? digits.slice(0, 2);
}

/**
 * Agrupa de tres en tres. Si el último grupo quedara con un solo dígito se
 * junta con el anterior, que se lee mucho mejor (`415 555 2671`).
 */
function groupDigits(national: string): string {
  if (!national) return '';
  const groups: string[] = [];
  for (let i = 0; i < national.length; i += 3) groups.push(national.slice(i, i + 3));
  if (groups.length > 1 && groups[groups.length - 1].length === 1) {
    const last = groups.pop()!;
    groups[groups.length - 1] += last;
  }
  return groups.join(' ');
}
