/** Lógica táctil del diseñador de invitación (HU32). */

/** Tamaño base del lienzo: el mismo que usa la landing pública. */
export const CANVAS_W = 324;
export const CANVAS_H = 576;

/**
 * Escala del lienzo según el espacio disponible.
 * - Vista previa: cabe entero en la pantalla, como lo ve el invitado.
 * - Móvil (≤ 480 px de ancho útil): ocupa el ancho, igual que en la landing.
 * - Escritorio: tamaño real, sin agrandar.
 */
export function canvasScaleFor(width: number, height: number, preview: boolean): number {
  if (!(width > 0)) return 1;
  if (preview) {
    const s = Math.min(width / CANVAS_W, height > 0 ? height / CANVAS_H : Infinity);
    return round(s);
  }
  if (width <= 480) return round(Math.min(width, 480) / CANVAS_W);
  return round(Math.min(1, width / CANVAS_W));
}

/** Dos toques sobre el mismo elemento en menos de 350 ms. */
export function isDoubleTap(last: { id: string; t: number } | null, id: string, now: number): boolean {
  return !!last && last.id === id && now - last.t < 350;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
