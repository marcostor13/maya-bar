/**
 * Variables que se pueden escribir en un texto para que se sustituyan por los
 * datos de cada contacto: campañas, plantillas, respuestas automáticas de
 * formularios y cualquier otro envío personalizado usan el mismo vocabulario.
 */

import { toText } from './to-text';

/** Datos del contacto que hacen falta para resolver las variables. */
export interface TokenSource {
  name?: string;
  email?: string;
  phone?: string;
  customFields?: Record<string, unknown>;
}

/** Datos del envío que no son del contacto. */
export interface TokenContext {
  /** Nombre de la empresa que envía. */
  empresa?: string;
  /** Link (normalmente corto y personal) del mensaje. */
  link?: string;
  /** Link para darse de baja. */
  baja?: string;
}

export interface TokenInfo {
  token: string;
  label: string;
  /** Valor de muestra para las vistas previas. */
  example: string;
}

type Resolver = (c: TokenSource, ctx: TokenContext, arg?: string) => string;

const TOKENS: Record<string, Resolver> = {
  nombre: (c) => c.name ?? '',
  primer_nombre: (c) => (c.name ?? '').trim().split(/\s+/)[0] ?? '',
  email: (c) => c.email ?? '',
  telefono: (c) => c.phone ?? '',
  empresa: (_, ctx) => ctx.empresa ?? '',
  link: (_, ctx) => ctx.link ?? '',
  baja: (_, ctx) => ctx.baja ?? '',
  campo: (c, _, arg) => {
    if (!arg) return '';
    const fields = c.customFields ?? {};
    const wanted = arg.trim().toLowerCase();
    const key = Object.keys(fields).find((k) => k.toLowerCase() === wanted);
    const value = key ? fields[key] : undefined;
    if (value === null || value === undefined) return '';
    return typeof value === 'object' ? JSON.stringify(value) : toText(value);
  },
};

/** Catálogo para la interfaz: lo que se ofrece como chips. */
export const TOKEN_CATALOG: TokenInfo[] = [
  { token: '{nombre}', label: 'Nombre completo', example: 'María Pérez' },
  { token: '{primer_nombre}', label: 'Primer nombre', example: 'María' },
  { token: '{email}', label: 'Email', example: 'maria@correo.com' },
  { token: '{telefono}', label: 'Teléfono', example: '+51 999 888 777' },
  { token: '{empresa}', label: 'Tu empresa', example: 'Mi Empresa' },
  { token: '{link}', label: 'Link corto', example: 'https://go.link/aB3xK9p' },
  { token: '{baja}', label: 'Link de baja', example: 'https://go.link/baja' },
];

/** Las variables disponibles, para ofrecerlas en la interfaz. */
export const AVAILABLE_TOKENS = TOKEN_CATALOG.map((t) => t.token);

/**
 * `{nombre}` o `{campo:Ciudad}`. Lo que no sea una variable conocida se deja
 * tal cual: el CSS de un email (`{color:red}`) no debe tocarse.
 */
const TOKEN_RE = /\{([a-z_]+)(?::([^{}\n]{1,80}))?\}/gi;

function replaceTokens(
  value: string,
  contact: TokenSource,
  ctx: TokenContext,
  transform: (v: string) => string,
): string {
  return value.replace(TOKEN_RE, (match, name: string, arg?: string) => {
    const resolver = TOKENS[name.toLowerCase()];
    return resolver ? transform(resolver(contact, ctx, arg)) : match;
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sustituye las variables y aplana el resultado a espacios simples, porque
 * Meta rechaza los parámetros de plantilla que contienen saltos de línea,
 * tabuladores o más de cuatro espacios seguidos, y los nombres importados a
 * menudo los traen.
 */
export function fillTokens(
  value: string,
  contact: TokenSource,
  ctx: TokenContext = {},
): string {
  return replaceTokens(value, contact, ctx, (v) => v)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Igual que `fillTokens` pero conservando los saltos de línea, para textos
 * largos como un SMS o el cuerpo en texto plano de un email.
 */
export function fillTokensMultiline(
  value: string,
  contact: TokenSource,
  ctx: TokenContext = {},
): string {
  return replaceTokens(value, contact, ctx, (v) => v);
}

/**
 * Para HTML: los valores se escapan, así un nombre con `<` no rompe el
 * marcado ni inyecta nada en el correo.
 */
export function fillTokensHtml(
  value: string,
  contact: TokenSource,
  ctx: TokenContext = {},
): string {
  return replaceTokens(value, contact, ctx, escapeHtml);
}

/** Variables con forma válida pero que no existen: casi siempre una errata. */
export function unknownTokens(value: string): string[] {
  const found = new Set<string>();
  // Solo se mira lo que parece una variable (`{palabra}`), no cualquier llave.
  for (const m of value.matchAll(/\{([a-z_]+)\}/gi)) {
    if (!TOKENS[m[1].toLowerCase()]) found.add(m[0]);
  }
  return [...found];
}

/** True si el texto usa la variable indicada (sin llaves), p. ej. `link`. */
export function usesToken(value: string, name: string): boolean {
  return new RegExp(`\\{${name}\\}`, 'i').test(value);
}
