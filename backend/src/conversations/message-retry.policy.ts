/**
 * Qué fallos de envío de WhatsApp se reintentan solos y cada cuánto (HU7).
 *
 * Solo los que dependen de la cuenta o de Meta y se arreglan sin tocar el
 * mensaje: facturación, mantenimiento, caída, límite de velocidad, token
 * caducado. Los que dependen del cliente (fuera de ventana, no entregable) o
 * castigan la calidad del número (131048, spam) no.
 */
const TRANSIENT_META_CODES = new Set([
  131042, // problema de pago o moneda de la WABA
  131057, // cuenta en mantenimiento
  131000, // error genérico de Meta
  131016, // servicio no disponible
  133004, // servidor temporalmente no disponible
  130429, // límite de velocidad de la API
  131056, // demasiados mensajes al mismo número
  190, // token caducado (el usuario lo reconecta)
]);

/**
 * Fallos de red en los que la petición no llegó a Meta. Un timeout o un corte a
 * mitad (ETIMEDOUT, ECONNRESET) no entra: Meta pudo haberlo enviado y el
 * reintento duplicaría el mensaje al cliente.
 */
const NETWORK_ERROR = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN/;

/** Esperas entre intentos, en minutos; el último se repite. */
const DELAYS_MIN = [2, 5, 10, 20, 30, 60];

/**
 * Código de Meta del error guardado. Viene como `#131042 …` del webhook o como
 * `CloudAPI 400 #131042: …` del envío.
 */
export function metaErrorCode(error: string | undefined): number | undefined {
  const m = /#(\d+)/.exec(error ?? '');
  return m ? Number(m[1]) : undefined;
}

export function isTransientSendError(error: string | undefined): boolean {
  if (!error) return false;
  const code = metaErrorCode(error);
  if (code !== undefined) return TRANSIENT_META_CODES.has(code);
  return NETWORK_ERROR.test(error);
}

/** Espera antes del siguiente intento, según los que ya se hicieron. */
export function retryDelayMs(retryCount: number): number {
  const i = Math.min(Math.max(retryCount, 0), DELAYS_MIN.length - 1);
  return DELAYS_MIN[i] * 60_000;
}

/** El primer intento espera esto desde el fallo. */
export const FIRST_RETRY_MS = DELAYS_MIN[0] * 60_000;
