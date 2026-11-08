/**
 * Descripción legible de un dispositivo a partir de su User-Agent, para la
 * lista de Configuración ("Chrome en Android", "Safari en iPhone"…).
 */
export function describeUserAgent(ua: string | undefined): string {
  if (!ua) return 'Navegador';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  // El orden importa: Edge y Opera también dicen "Chrome", y Chrome "Safari".
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(ua)
        ? 'Firefox'
        : /CriOS|Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navegador';
  return os ? `${browser} en ${os}` : browser;
}
