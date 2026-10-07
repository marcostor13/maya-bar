import { SmsBodyType, SmsHeader } from './sms-config.schema';

/**
 * Arma la petición HTTP a un proveedor de SMS a partir de la definición que
 * guardó el usuario. Función pura: sin red ni base de datos, para poder
 * probarla entera.
 */

export interface SmsRequestSpec {
  url: string;
  method: 'POST' | 'GET' | 'PUT';
  headers: SmsHeader[];
  bodyType: SmsBodyType;
  body: string;
}

export interface SmsRequestValues {
  /** Destino en E.164: `+51999888777`. */
  to: string;
  message: string;
  from: string;
  secrets: Record<string, string>;
}

export interface BuiltSmsRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

type Encoder = (value: string) => string;

const raw: Encoder = (v) => v;
const urlEncode: Encoder = (v) => encodeURIComponent(v);
/** Para insertar dentro de una cadena JSON ya entrecomillada. */
const jsonEncode: Encoder = (v) => JSON.stringify(v).slice(1, -1);

const TOKEN_RE =
  /\{(to|to_digits|message|from|secret|basic)(?::([a-z0-9_]+))?(?::([a-z0-9_]+))?\}/gi;

function fill(template: string, v: SmsRequestValues, encode: Encoder): string {
  return template.replace(
    TOKEN_RE,
    (match, name: string, a?: string, b?: string) => {
      switch (name.toLowerCase()) {
        case 'to':
          return encode(v.to);
        case 'to_digits':
          return encode(v.to.replace(/\D/g, ''));
        case 'message':
          return encode(v.message);
        case 'from':
          return encode(v.from);
        case 'secret':
          return a ? encode(v.secrets[a.toLowerCase()] ?? '') : match;
        case 'basic': {
          if (!a || !b) return match;
          const pair = `${v.secrets[a.toLowerCase()] ?? ''}:${v.secrets[b.toLowerCase()] ?? ''}`;
          return encode(`Basic ${Buffer.from(pair).toString('base64')}`);
        }
        default:
          return match;
      }
    },
  );
}

/** Nombres de secreto que usa una definición, para avisar de los que falten. */
export function referencedSecrets(spec: SmsRequestSpec): string[] {
  const text = [spec.url, spec.body, ...spec.headers.map((h) => h.value)].join(
    '\n',
  );
  const names = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) {
    const kind = m[1].toLowerCase();
    if (kind === 'secret' && m[2]) names.add(m[2].toLowerCase());
    if (kind === 'basic') {
      if (m[2]) names.add(m[2].toLowerCase());
      if (m[3]) names.add(m[3].toLowerCase());
    }
  }
  return [...names];
}

export function buildSmsRequest(
  spec: SmsRequestSpec,
  values: SmsRequestValues,
): BuiltSmsRequest {
  let url = fill(spec.url.trim(), values, urlEncode);
  const headers: Record<string, string> = {};
  for (const h of spec.headers) {
    const key = h.key.trim();
    if (key) headers[key] = fill(h.value, values, raw);
  }
  const hasType = Object.keys(headers).some(
    (k) => k.toLowerCase() === 'content-type',
  );

  let body: string | undefined;
  switch (spec.bodyType) {
    case 'json':
      body = fill(spec.body, values, jsonEncode);
      if (!hasType) headers['Content-Type'] = 'application/json';
      break;
    case 'form':
      body = fill(spec.body.replace(/\s*\n\s*/g, '&'), values, urlEncode);
      if (!hasType)
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      break;
    case 'query': {
      const query = fill(
        spec.body.replace(/\s*\n\s*/g, '&'),
        values,
        urlEncode,
      );
      if (query) url += (url.includes('?') ? '&' : '?') + query;
      break;
    }
    case 'none':
      break;
  }
  if (spec.method === 'GET') body = undefined;
  return { url, method: spec.method, headers, body };
}

/** Lee `a.b.0.c` de un objeto; `undefined` si el camino no existe. */
export function readPath(data: unknown, path: string): unknown {
  let current: unknown = data;
  for (const part of path.split('.').filter(Boolean)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
