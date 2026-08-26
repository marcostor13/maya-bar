/**
 * Tokens que se pueden escribir en un texto para que se sustituyan por los
 * datos de cada contacto: campañas, respuestas automáticas de formularios y
 * cualquier otro envío personalizado usan el mismo vocabulario.
 */

/** Datos del contacto que hacen falta para resolver los tokens. */
export interface TokenSource {
  name?: string;
  email?: string;
  phone?: string;
}

const TOKENS: Record<string, (c: TokenSource) => string> = {
  nombre: (c) => c.name ?? '',
  email: (c) => c.email ?? '',
  telefono: (c) => c.phone ?? '',
};

/** Los tokens disponibles, para ofrecerlos en la interfaz. */
export const AVAILABLE_TOKENS = Object.keys(TOKENS).map((k) => `{${k}}`);

/**
 * Reemplaza `{nombre}`, `{email}` y `{telefono}` por los datos del contacto.
 *
 * El resultado se aplana a espacios simples porque Meta rechaza los parámetros
 * de plantilla que contienen saltos de línea, tabuladores o más de cuatro
 * espacios seguidos, y los nombres importados a menudo los traen.
 */
export function fillTokens(value: string, contact: TokenSource): string {
  const filled = value.replace(
    /\{(nombre|email|telefono)\}/gi,
    (_, key: string) => TOKENS[key.toLowerCase()](contact),
  );
  return filled.replace(/\s+/g, ' ').trim();
}

/**
 * Igual que `fillTokens` pero conservando los saltos de línea, para textos
 * largos como el cuerpo de un email, donde el formato sí importa.
 */
export function fillTokensMultiline(value: string, contact: TokenSource): string {
  return value.replace(
    /\{(nombre|email|telefono)\}/gi,
    (_, key: string) => TOKENS[key.toLowerCase()](contact),
  );
}
