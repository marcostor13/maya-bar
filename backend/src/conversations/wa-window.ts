/** Meta solo deja escribir libremente 24 h después del último mensaje del cliente. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Estado de la ventana de atención de un chat (HU27). */
export interface WindowStatus {
  /** Solo WhatsApp Cloud API tiene ventana; el resto escribe siempre. */
  applies: boolean;
  open: boolean;
  /** Cuándo cierra (o cerró); null si el cliente nunca escribió. */
  expiresAt: Date | null;
}

export function windowFrom(
  applies: boolean,
  lastInboundAt: Date | null | undefined,
  now = Date.now(),
): WindowStatus {
  if (!applies) return { applies: false, open: true, expiresAt: null };
  if (!lastInboundAt) return { applies: true, open: false, expiresAt: null };
  const expiresAt = new Date(new Date(lastInboundAt).getTime() + WINDOW_MS);
  return { applies: true, open: expiresAt.getTime() > now, expiresAt };
}
