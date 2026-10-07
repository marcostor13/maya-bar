/**
 * Desglose mínimo de un user-agent, sin dependencias: basta para saber desde
 * qué se hizo clic y para apartar a los bots de las métricas.
 */

export interface ParsedUserAgent {
  browser: string;
  browserVersion: string;
  os: string;
  device: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';
  isBot: boolean;
}

/**
 * Previsualizadores de enlaces y rastreadores. WhatsApp, Telegram, Slack o
 * Facebook abren el link para pintar la tarjeta en el chat: no son personas.
 */
const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|facebookcatalog|whatsapp\/|telegrambot|slackbot|discordbot|twitterbot|linkedinbot|skypeuripreview|pinterest|embedly|quora link|bitlybot|google-safety|googleother|headlesschrome|lighthouse|pingdom|uptimerobot|monitor|python-requests|curl\/|wget\/|httpclient|axios\/|node-fetch|go-http-client|java\/|okhttp|scrapy|phantomjs/i;

/** [nombre, expresión con el grupo de versión]. El orden importa. */
const BROWSERS: [string, RegExp][] = [
  ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
  ['Opera', /(?:OPR|Opera)\/([\d.]+)/],
  ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
  ['Instagram', /Instagram ([\d.]+)/],
  ['Facebook', /FBAV\/([\d.]+)/],
  ['TikTok', /(?:BytedanceWebview|musical_ly)[/_]([\d.]+)/],
  ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
  ['Safari', /Version\/([\d.]+).*Safari\//],
];

const OPERATING_SYSTEMS: [string, RegExp][] = [
  ['iOS', /iPhone|iPad|iPod/],
  ['Android', /Android/],
  ['Windows', /Windows NT/],
  ['macOS', /Mac OS X|Macintosh/],
  ['ChromeOS', /CrOS/],
  ['Linux', /Linux|X11/],
];

export function parseUserAgent(raw: string | undefined): ParsedUserAgent {
  const ua = (raw ?? '').slice(0, 600);
  if (!ua.trim())
    // Sin user-agent no es un navegador de verdad.
    return {
      browser: 'Desconocido',
      browserVersion: '',
      os: 'Desconocido',
      device: 'bot',
      isBot: true,
    };

  if (BOT_RE.test(ua))
    return {
      browser: 'Bot',
      browserVersion: '',
      os: 'Desconocido',
      device: 'bot',
      isBot: true,
    };

  let browser = 'Otro';
  let browserVersion = '';
  for (const [name, re] of BROWSERS) {
    const m = re.exec(ua);
    if (m) {
      browser = name;
      browserVersion = (m[1] ?? '').split('.')[0];
      break;
    }
  }

  const os = OPERATING_SYSTEMS.find(([, re]) => re.test(ua))?.[0] ?? 'Otro';

  let device: ParsedUserAgent['device'] = 'desktop';
  if (
    /iPad|Tablet|PlayBook|Silk/.test(ua) ||
    (/Android/.test(ua) && !/Mobile/.test(ua))
  )
    device = 'tablet';
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) device = 'mobile';

  return { browser, browserVersion, os, device, isBot: false };
}

/** Cabecera `Cookie` a objeto, con topes para no guardar basura. */
export function parseCookies(
  header: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';').slice(0, 30)) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    // Mongo no admite puntos ni `$` en las claves.
    const key = part.slice(0, eq).trim().replace(/[.$]/g, '_').slice(0, 60);
    if (!key) continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // valor mal codificado: se guarda tal cual
    }
    out[key] = value.slice(0, 300);
  }
  return out;
}

/**
 * IP del visitante detrás del proxy. `X-Forwarded-For` lo puede escribir el
 * propio cliente: solo es de fiar el último valor, que es el que añade
 * nuestro proxy (Traefik). Si delante hay Cloudflare, su cabecera manda.
 */
export function clientIp(
  headers: {
    forwardedFor?: string | string[];
    cfConnectingIp?: string | string[];
  },
  fallback: string | undefined,
): string {
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const cf = one(headers.cfConnectingIp)?.trim();
  const chain = (one(headers.forwardedFor) ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return (cf || chain[chain.length - 1] || fallback || '').replace(
    /^::ffff:/,
    '',
  );
}
