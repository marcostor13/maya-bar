/** WhatsApp Cloud API: texto libre solo hasta 24 h después del último mensaje del cliente (HU27). */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Ventana tal como la devuelve `GET /conversations/:id/window`. */
export interface ChatWindow {
  applies: boolean;
  open: boolean;
  expiresAt: string | null;
}

export interface WindowState {
  applies: boolean;
  open: boolean;
  /** Milisegundos que le quedan; 0 si está cerrada. */
  msLeft: number;
}

/**
 * Estado actual de la ventana. Lo del servidor se combina con el último
 * entrante que ya está en pantalla: si el cliente acaba de escribir por el
 * socket, la ventana se reabre sin volver a preguntar.
 */
export function windowState(
  server: ChatWindow | null,
  lastInboundAt: string | undefined,
  now: number,
): WindowState {
  if (!server?.applies) return { applies: false, open: true, msLeft: 0 };
  const fromServer = server.expiresAt ? new Date(server.expiresAt).getTime() : 0;
  const fromScreen = lastInboundAt ? new Date(lastInboundAt).getTime() + WINDOW_MS : 0;
  const expires = Math.max(fromServer, fromScreen);
  const msLeft = Math.max(0, expires - now);
  return { applies: true, open: msLeft > 0, msLeft };
}

/** "3 h 20 min", "45 min", "menos de 1 min". */
export function formatLeft(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'menos de 1 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Cuerpo de la plantilla con las variables escritas; las vacías se quedan como `{{n}}`. */
export function renderTemplate(text: string, vars: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, n: string) => vars[Number(n) - 1]?.trim() || whole);
}
