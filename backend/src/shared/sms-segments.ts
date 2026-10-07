/**
 * Cuántos SMS reales ocupa un texto. Los operadores cobran por segmento, y un
 * solo carácter fuera del alfabeto GSM-7 (una tilde poco común, un emoji)
 * cambia la codificación a UCS-2 y reduce el segmento de 160 a 70 caracteres.
 */

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
/** Estos existen en GSM-7 pero ocupan dos posiciones (van con escape). */
const GSM7_EXTENDED = '^{}\\[~]|€\f';

export interface SmsSegments {
  encoding: 'GSM-7' | 'UCS-2';
  /** Posiciones ocupadas (no siempre igual a `text.length`). */
  length: number;
  segments: number;
  /** Tamaño del segmento con esta codificación y este número de partes. */
  perSegment: number;
  /** Caracteres que forzaron UCS-2, para poder avisar al usuario. */
  unicodeChars: string[];
}

export function smsSegments(text: string): SmsSegments {
  const unicode = new Set<string>();
  let gsmLength = 0;
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) gsmLength += 1;
    else if (GSM7_EXTENDED.includes(ch)) gsmLength += 2;
    else unicode.add(ch);
  }

  if (unicode.size === 0) {
    const single = gsmLength <= 160;
    const perSegment = single ? 160 : 153;
    return {
      encoding: 'GSM-7',
      length: gsmLength,
      segments: gsmLength === 0 ? 0 : Math.ceil(gsmLength / perSegment),
      perSegment,
      unicodeChars: [],
    };
  }

  // UCS-2 cuenta unidades UTF-16: un emoji ocupa dos.
  const length = text.length;
  const single = length <= 70;
  const perSegment = single ? 70 : 67;
  return {
    encoding: 'UCS-2',
    length,
    segments: Math.ceil(length / perSegment),
    perSegment,
    unicodeChars: [...unicode].slice(0, 12),
  };
}
