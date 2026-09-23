/**
 * Fuentes externas de la prospección. Cada función es independiente y solo
 * habla HTTP: así la investigación puede usar las que tengan key y seguir si
 * una falla.
 */

import { assertPublicHost, isPrivateAddress } from '../shared/network';

export { isPrivateAddress };

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
/** Tope de HTML leído por página: más allá no aporta y consume memoria. */
const MAX_HTML_BYTES = 1_500_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function json<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const body = JSON.parse(text) as {
        error?: { message?: string } | string;
        message?: string;
        errors?: { details?: string }[];
      };
      msg =
        (typeof body.error === 'string' ? body.error : body.error?.message) ||
        body.message ||
        body.errors?.[0]?.details ||
        msg;
    } catch {
      /* respuesta no JSON: se usa el texto */
    }
    throw new Error(`${label} ${res.status}: ${msg}`);
  }
  return JSON.parse(text) as T;
}

// ──────────────────────────────────────────────────────────────────────────
// Utilidades de URL
// ──────────────────────────────────────────────────────────────────────────

export function normalizeUrl(raw?: string | null): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname.includes('.')) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** Dominio sin `www.`; los perfiles de redes no cuentan como web propia. */
export function domainOf(raw?: string | null): string | undefined {
  const url = normalizeUrl(raw);
  if (!url) return undefined;
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  return SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
    ? undefined
    : host;
}

const SOCIAL_PATTERNS: { network: string; re: RegExp }[] = [
  {
    network: 'facebook',
    re: /https?:\/\/(?:[a-z]+\.)?facebook\.com\/[^\s"'<>?#]+/gi,
  },
  {
    network: 'instagram',
    re: /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>?#]+/gi,
  },
  {
    network: 'linkedin',
    re: /https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:company|in|school)\/[^\s"'<>?#]+/gi,
  },
  {
    network: 'tiktok',
    re: /https?:\/\/(?:www\.)?tiktok\.com\/@[^\s"'<>?#]+/gi,
  },
  {
    network: 'youtube',
    re: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[^\s"'<>?#]+/gi,
  },
  {
    network: 'x',
    re: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]+/gi,
  },
  {
    network: 'whatsapp',
    re: /https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send)[^\s"'<>]*/gi,
  },
];

const SOCIAL_HOSTS = [
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'tiktok.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  'wa.me',
  'whatsapp.com',
];

/** Enlaces de redes que no son perfiles (compartir, plugins, políticas). */
const SOCIAL_NOISE =
  /\/(sharer|share|plugins|dialog|tr\?|intent|hashtag|privacy|policies|legal|help|login)/i;

export function extractSocial(
  text: string,
): { network: string; url: string }[] {
  const seen = new Set<string>();
  const out: { network: string; url: string }[] = [];
  for (const { network, re } of SOCIAL_PATTERNS) {
    for (const match of text.matchAll(re)) {
      const url = match[0].replace(/[\\/.,;)]+$/, '').replace(/&amp;/g, '&');
      if (SOCIAL_NOISE.test(url)) continue;
      const key = url.toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ network, url });
    }
  }
  return out;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const FAKE_EMAIL =
  /\.(png|jpe?g|gif|webp|svg|css|js)$|@(example|sentry|domain|email|wixpress|2x)\.|^(user|name|tu|your)@/i;

export function extractEmails(text: string): string[] {
  const set = new Set<string>();
  for (const m of text.matchAll(EMAIL_RE)) {
    const email = m[0].toLowerCase().replace(/\.$/, '');
    if (!FAKE_EMAIL.test(email)) set.add(email);
  }
  return [...set].slice(0, 15);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Solo teléfonos explícitos (tel:, wa.me): los números sueltos dan ruido. */
export function extractPhones(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/href=["']tel:([^"']+)["']/gi))
    set.add(safeDecode(m[1]).replace(/[^\d+]/g, ''));
  for (const m of html.matchAll(/wa\.me\/(\d{7,15})/gi)) set.add(`+${m[1]}`);
  for (const m of html.matchAll(
    /api\.whatsapp\.com\/send\/?\?phone=(\d{7,15})/gi,
  ))
    set.add(`+${m[1]}`);
  return [...set].filter((p) => p.replace(/\D/g, '').length >= 7).slice(0, 10);
}

// ──────────────────────────────────────────────────────────────────────────
// Sitio web
// ──────────────────────────────────────────────────────────────────────────

const TECH_SIGNATURES: [string, RegExp][] = [
  ['WordPress', /wp-content|wp-includes/i],
  ['WooCommerce', /woocommerce/i],
  ['Elementor', /elementor/i],
  ['Shopify', /cdn\.shopify\.com|Shopify\.theme/i],
  ['Wix', /static\.wixstatic\.com|wix\.com/i],
  ['Squarespace', /squarespace\.com/i],
  ['Webflow', /webflow\.(com|io)/i],
  ['Joomla', /\/media\/jui\/|joomla/i],
  ['Drupal', /drupal/i],
  ['Magento', /mage\/|magento/i],
  ['PrestaShop', /prestashop/i],
  ['Next.js', /__NEXT_DATA__|_next\/static/i],
  ['Angular', /ng-version=/i],
  ['Vue', /data-v-[a-f0-9]{6,}|vue(\.min)?\.js/i],
  ['React', /react(-dom)?(\.production)?(\.min)?\.js|data-reactroot/i],
  ['jQuery', /jquery(\.min)?\.js/i],
  ['Google Tag Manager', /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/],
  ['Google Analytics 4', /gtag\/js\?id=G-|['"]G-[A-Z0-9]{6,}['"]/],
  ['Google Ads', /gtag\/js\?id=AW-|googleadservices/i],
  ['Meta Pixel', /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(/i],
  ['TikTok Pixel', /analytics\.tiktok\.com/i],
  ['LinkedIn Insight', /snap\.licdn\.com/i],
  ['Hotjar', /static\.hotjar\.com/i],
  ['Microsoft Clarity', /clarity\.ms/i],
  ['HubSpot', /js\.hs-scripts\.com|hs-analytics/i],
  ['Tawk.to', /embed\.tawk\.to/i],
  ['Intercom', /widget\.intercom\.io/i],
  ['Crisp', /client\.crisp\.chat/i],
  ['Zendesk', /zdassets\.com/i],
  ['Botón de WhatsApp', /wa\.me\/|api\.whatsapp\.com/i],
  ['reCAPTCHA', /recaptcha/i],
  ['Cloudflare', /cdnjs\.cloudflare\.com|cf-ray|__cf_bm/i],
  ['Calendly', /calendly\.com/i],
  ['Mailchimp', /list-manage\.com|mailchimp/i],
];

export interface PageData {
  url: string;
  title?: string;
  description?: string;
  text: string;
  html: string;
}

export interface WebsiteReport {
  url: string;
  finalUrl?: string;
  reachable: boolean;
  status?: number;
  https: boolean;
  responseMs?: number;
  title?: string;
  description?: string;
  language?: string;
  hasViewport: boolean;
  hasOpenGraph: boolean;
  hasSchemaOrg: boolean;
  hasFavicon: boolean;
  h1Count: number;
  images: number;
  imagesWithoutAlt: number;
  wordCount: number;
  copyrightYear?: number;
  technologies: string[];
  hasContactForm: boolean;
  hasBlog: boolean;
  hasEcommerce: boolean;
  pagesVisited: string[];
  emails: string[];
  phones: string[];
  social: { network: string; url: string }[];
  /** Texto de la web (portada + páginas clave) para que lo lea la IA. */
  excerpt: string;
  error?: string;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function metaContent(
  html: string,
  attr: string,
  name: string,
): string | undefined {
  const re1 = new RegExp(
    `<meta[^>]+${attr}=["']${name}["'][^>]*content=["']([^"']*)["']`,
    'i',
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${name}["']`,
    'i',
  );
  return (html.match(re1)?.[1] ?? html.match(re2)?.[1])?.trim() || undefined;
}

export function parsePage(url: string, html: string): PageData {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    url,
    title: title ? htmlToText(title) : undefined,
    description: metaContent(html, 'name', 'description'),
    text: htmlToText(html),
    html,
  };
}

/** Páginas internas que suelen tener contacto y personas. */
const KEY_PAGE_RE =
  /(contact|contacto|nosotros|about|quienes|quiénes|equipo|team|staff|empresa|servicios|services)/i;

export function keyPageLinks(html: string, base: string, limit = 4): string[] {
  const baseUrl = new URL(base);
  const out: string[] = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    const href = m[1];
    if (/^(mailto|tel|javascript|whatsapp):/i.test(href)) continue;
    let abs: URL;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (
      abs.hostname.replace(/^www\./, '') !==
      baseUrl.hostname.replace(/^www\./, '')
    )
      continue;
    if (!KEY_PAGE_RE.test(abs.pathname)) continue;
    if (/\.(pdf|jpe?g|png|zip|docx?)$/i.test(abs.pathname)) continue;
    abs.hash = '';
    const key = abs.toString();
    if (!out.includes(key) && key !== baseUrl.toString()) out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

/** Redirecciones que se siguen a mano, comprobando cada destino. */
const MAX_REDIRECTS = 5;

/**
 * La web de un prospecto la puede escribir cualquier usuario: sin esta
 * comprobación el servidor descargaría direcciones internas (SSRF).
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('Solo se analizan direcciones http y https');
  await assertPublicHost(url.hostname);
  return url;
}

/** Lee el cuerpo hasta `max` bytes y corta la descarga. */
async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < max) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).subarray(0, max).toString('utf8');
}

async function fetchHtml(
  url: string,
): Promise<{ html: string; status: number; finalUrl: string; ms: number }> {
  const started = Date.now();
  let current = url;
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(current);
    const res = await fetchWithTimeout(
      current,
      {
        redirect: 'manual',
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
      },
      20_000,
    );
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => undefined);
      if (hop >= MAX_REDIRECTS) throw new Error('Demasiadas redirecciones');
      current = new URL(location, current).toString();
      continue;
    }
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) {
      await res.body?.cancel().catch(() => undefined);
      return {
        html: '',
        status: res.status,
        finalUrl: current,
        ms: Date.now() - started,
      };
    }
    const html = await readCapped(res, MAX_HTML_BYTES);
    return {
      html,
      status: res.status,
      finalUrl: current,
      ms: Date.now() - started,
    };
  }
}

/** Recorre la portada y las páginas clave y resume lo que dice la web. */
export async function scrapeWebsite(rawUrl: string): Promise<WebsiteReport> {
  const url = normalizeUrl(rawUrl) ?? rawUrl;
  const empty: WebsiteReport = {
    url,
    reachable: false,
    https: url.startsWith('https://'),
    hasViewport: false,
    hasOpenGraph: false,
    hasSchemaOrg: false,
    hasFavicon: false,
    h1Count: 0,
    images: 0,
    imagesWithoutAlt: 0,
    wordCount: 0,
    technologies: [],
    hasContactForm: false,
    hasBlog: false,
    hasEcommerce: false,
    pagesVisited: [],
    emails: [],
    phones: [],
    social: [],
    excerpt: '',
  };

  let home: Awaited<ReturnType<typeof fetchHtml>>;
  try {
    home = await fetchHtml(url);
  } catch (err) {
    // Algunos sitios solo responden por http.
    if (url.startsWith('https://')) {
      try {
        home = await fetchHtml(url.replace(/^https:/, 'http:'));
      } catch {
        return { ...empty, error: errorText(err) };
      }
    } else return { ...empty, error: errorText(err) };
  }
  if (!home.html)
    return {
      ...empty,
      status: home.status,
      finalUrl: home.finalUrl,
      error: `La web respondió ${home.status} sin HTML`,
    };

  const page = parsePage(home.finalUrl, home.html);
  const extra: PageData[] = [];
  for (const link of keyPageLinks(home.html, home.finalUrl)) {
    try {
      const sub = await fetchHtml(link);
      if (sub.html) extra.push(parsePage(sub.finalUrl, sub.html));
    } catch {
      /* una página interna caída no invalida el resto */
    }
  }

  const allHtml = [home.html, ...extra.map((p) => p.html)].join('\n');
  const imgs = [...home.html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const years = [
    ...page.text.matchAll(/(?:©|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d{2})/gi),
  ]
    .map((m) => Number(m[1]))
    .filter((y) => y > 2000);

  const excerpt = [
    `PORTADA (${page.url}): ${page.text.slice(0, 3500)}`,
    ...extra.map((p) => `PÁGINA ${p.url}: ${p.text.slice(0, 1500)}`),
  ].join('\n\n');

  return {
    url,
    finalUrl: home.finalUrl,
    reachable: home.status < 400,
    status: home.status,
    https: home.finalUrl.startsWith('https://'),
    responseMs: home.ms,
    title: page.title,
    description: page.description,
    language: home.html.match(/<html[^>]*\slang=["']([^"']+)["']/i)?.[1],
    hasViewport: /<meta[^>]+name=["']viewport["']/i.test(home.html),
    hasOpenGraph: /property=["']og:/i.test(home.html),
    hasSchemaOrg: /application\/ld\+json/i.test(home.html),
    hasFavicon: /rel=["'][^"']*icon[^"']*["']/i.test(home.html),
    h1Count: (home.html.match(/<h1\b/gi) ?? []).length,
    images: imgs.length,
    imagesWithoutAlt: imgs.filter((i) => !/\balt=["'][^"']+["']/i.test(i))
      .length,
    wordCount: page.text.split(/\s+/).filter(Boolean).length,
    copyrightYear: years.length ? Math.max(...years) : undefined,
    technologies: TECH_SIGNATURES.filter(([, re]) => re.test(allHtml)).map(
      ([name]) => name,
    ),
    hasContactForm:
      /<form\b[\s\S]*?(email|correo|mensaje|message)[\s\S]*?<\/form>/i.test(
        allHtml,
      ),
    hasBlog: /href=["'][^"']*(\/blog|\/noticias|\/news|\/articulos)/i.test(
      allHtml,
    ),
    hasEcommerce:
      /(add[-_]to[-_]cart|\/cart\b|\/carrito\b|\/checkout\b|woocommerce|cdn\.shopify)/i.test(
        allHtml,
      ),
    pagesVisited: [page.url, ...extra.map((p) => p.url)],
    emails: extractEmails(
      allHtml.replace(/mailto:/gi, ' ') +
        ' ' +
        extra.map((p) => p.text).join(' '),
    ),
    phones: extractPhones(allHtml),
    social: extractSocial(allHtml),
    excerpt: excerpt.slice(0, 9000),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// PageSpeed Insights
// ──────────────────────────────────────────────────────────────────────────

export interface PageSpeedResult {
  strategy: 'mobile' | 'desktop';
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
  metrics: Record<string, string>;
  opportunities: { title: string; savings?: string }[];
  fieldData?: string;
}

interface LighthouseAudit {
  title?: string;
  score?: number | null;
  displayValue?: string;
  details?: { type?: string; overallSavingsMs?: number };
}

interface PageSpeedResponse {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<string, LighthouseAudit>;
  };
  loadingExperience?: { overall_category?: string };
}

export async function runPageSpeed(
  url: string,
  strategy: 'mobile' | 'desktop',
  apiKey?: string,
): Promise<PageSpeedResult> {
  const qs = new URLSearchParams({ url, strategy, locale: 'es' });
  for (const c of ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO'])
    qs.append('category', c);
  const call = async (key?: string) => {
    const params = new URLSearchParams(qs);
    if (key) params.set('key', key);
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
      {},
      120_000,
    );
    return json<PageSpeedResponse>(res, 'PageSpeed');
  };
  let body: PageSpeedResponse;
  try {
    body = await call(apiKey);
  } catch (err) {
    // Una key sin la API de PageSpeed habilitada responde 400/403: se reintenta
    // con la cuota anónima antes de dar el paso por fallido.
    if (!apiKey || !/PageSpeed 40[03]/.test(errorText(err))) throw err;
    body = await call();
  }
  const cats = body.lighthouseResult?.categories ?? {};
  const audits = body.lighthouseResult?.audits ?? {};
  const score = (k: string) =>
    typeof cats[k]?.score === 'number'
      ? Math.round(cats[k].score * 100)
      : undefined;
  const metricKeys: Record<string, string> = {
    'first-contentful-paint': 'FCP',
    'largest-contentful-paint': 'LCP',
    'total-blocking-time': 'TBT',
    'cumulative-layout-shift': 'CLS',
    'speed-index': 'Speed Index',
    interactive: 'TTI',
  };
  const metrics: Record<string, string> = {};
  for (const [key, label] of Object.entries(metricKeys))
    if (audits[key]?.displayValue) metrics[label] = audits[key].displayValue;

  const opportunities = Object.values(audits)
    .filter(
      (a) =>
        a.details?.type === 'opportunity' &&
        typeof a.score === 'number' &&
        a.score < 0.9 &&
        a.title,
    )
    .sort(
      (a, b) =>
        (b.details?.overallSavingsMs ?? 0) - (a.details?.overallSavingsMs ?? 0),
    )
    .slice(0, 6)
    .map((a) => ({ title: a.title as string, savings: a.displayValue }));

  return {
    strategy,
    performance: score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    seo: score('seo'),
    metrics,
    opportunities,
    fieldData: body.loadingExperience?.overall_category,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Google Places (API nueva)
// ──────────────────────────────────────────────────────────────────────────

export interface PlaceCandidate {
  placeId?: string;
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewsCount?: number;
  mapsUrl?: string;
  category?: string;
  source: 'google_places' | 'serper' | 'ai';
  description?: string;
}

interface PlacesPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
  editorialSummary?: { text?: string };
}

export async function placesTextSearch(
  query: string,
  apiKey: string,
): Promise<PlaceCandidate[]> {
  const res = await fetchWithTimeout(
    'https://places.googleapis.com/v1/places:searchText',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.internationalPhoneNumber',
          'places.nationalPhoneNumber',
          'places.websiteUri',
          'places.rating',
          'places.userRatingCount',
          'places.googleMapsUri',
          'places.primaryTypeDisplayName',
          'places.businessStatus',
          'places.editorialSummary',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize: 20,
        languageCode: 'es',
      }),
    },
  );
  const body = await json<{ places?: PlacesPlace[] }>(res, 'Google Places');
  return (body.places ?? [])
    .filter(
      (p) => p.displayName?.text && p.businessStatus !== 'CLOSED_PERMANENTLY',
    )
    .map((p) => ({
      placeId: p.id,
      name: p.displayName?.text as string,
      address: p.formattedAddress,
      phone: p.internationalPhoneNumber || p.nationalPhoneNumber,
      website: p.websiteUri,
      rating: p.rating,
      reviewsCount: p.userRatingCount,
      mapsUrl: p.googleMapsUri,
      category: p.primaryTypeDisplayName?.text,
      description: p.editorialSummary?.text,
      source: 'google_places' as const,
    }));
}

export interface PlaceDetails {
  rating?: number;
  reviewsCount?: number;
  openingHours?: string[];
  summary?: string;
  priceLevel?: string;
  photos?: number;
  reviews: { rating?: number; text: string; when?: string }[];
}

export async function placeDetails(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetails> {
  const res = await fetchWithTimeout(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=es`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'rating,userRatingCount,regularOpeningHours,editorialSummary,priceLevel,photos,reviews',
      },
    },
  );
  const body = await json<{
    rating?: number;
    userRatingCount?: number;
    regularOpeningHours?: { weekdayDescriptions?: string[] };
    editorialSummary?: { text?: string };
    priceLevel?: string;
    photos?: unknown[];
    reviews?: {
      rating?: number;
      text?: { text?: string };
      relativePublishTimeDescription?: string;
    }[];
  }>(res, 'Google Places');
  return {
    rating: body.rating,
    reviewsCount: body.userRatingCount,
    openingHours: body.regularOpeningHours?.weekdayDescriptions,
    summary: body.editorialSummary?.text,
    priceLevel: body.priceLevel,
    photos: body.photos?.length,
    reviews: (body.reviews ?? [])
      .filter((r) => r.text?.text)
      .map((r) => ({
        rating: r.rating,
        text: (r.text?.text as string).slice(0, 600),
        when: r.relativePublishTimeDescription,
      })),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Serper (búsqueda de Google)
// ──────────────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  link: string;
  snippet?: string;
}

export async function serperSearch(
  query: string,
  apiKey: string,
  num = 10,
): Promise<SearchResult[]> {
  const res = await fetchWithTimeout('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num, hl: 'es' }),
  });
  const body = await json<{
    organic?: { title?: string; link?: string; snippet?: string }[];
  }>(res, 'Serper');
  return (body.organic ?? [])
    .filter((r) => r.title && r.link)
    .map((r) => ({
      title: r.title as string,
      link: r.link as string,
      snippet: r.snippet,
    }));
}

export async function serperPlaces(
  query: string,
  apiKey: string,
): Promise<PlaceCandidate[]> {
  const res = await fetchWithTimeout('https://google.serper.dev/places', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, hl: 'es' }),
  });
  const body = await json<{
    places?: {
      title?: string;
      address?: string;
      phoneNumber?: string;
      website?: string;
      rating?: number;
      ratingCount?: number;
      category?: string;
      cid?: string;
    }[];
  }>(res, 'Serper');
  return (body.places ?? [])
    .filter((p) => p.title)
    .map((p) => ({
      name: p.title as string,
      address: p.address,
      phone: p.phoneNumber,
      website: p.website,
      rating: p.rating,
      reviewsCount: p.ratingCount,
      category: p.category,
      mapsUrl: p.cid ? `https://maps.google.com/?cid=${p.cid}` : undefined,
      source: 'serper' as const,
    }));
}

// ──────────────────────────────────────────────────────────────────────────
// Hunter.io (personas y correos del dominio)
// ──────────────────────────────────────────────────────────────────────────

export interface HunterResult {
  organization?: string;
  pattern?: string;
  people: {
    name: string;
    role?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    confidence?: number;
  }[];
  genericEmails: string[];
}

export async function hunterDomainSearch(
  domain: string,
  apiKey: string,
): Promise<HunterResult> {
  const qs = new URLSearchParams({ domain, api_key: apiKey, limit: '10' });
  const res = await fetchWithTimeout(
    `https://api.hunter.io/v2/domain-search?${qs.toString()}`,
  );
  const body = await json<{
    data?: {
      organization?: string;
      pattern?: string;
      emails?: {
        value?: string;
        type?: string;
        first_name?: string;
        last_name?: string;
        position?: string;
        linkedin?: string;
        phone_number?: string;
        confidence?: number;
      }[];
    };
  }>(res, 'Hunter');
  const emails = body.data?.emails ?? [];
  return {
    organization: body.data?.organization,
    pattern: body.data?.pattern,
    people: emails
      .filter((e) => e.type === 'personal' && (e.first_name || e.last_name))
      .map((e) => ({
        name: [e.first_name, e.last_name].filter(Boolean).join(' '),
        role: e.position || undefined,
        email: e.value,
        phone: e.phone_number || undefined,
        linkedin: e.linkedin || undefined,
        confidence: e.confidence,
      })),
    genericEmails: emails
      .filter((e) => e.type === 'generic' && e.value)
      .map((e) => e.value as string),
  };
}

export function errorText(err: unknown): string {
  if (err instanceof Error)
    return err.name === 'AbortError' ? 'Tiempo de espera agotado' : err.message;
  return String(err);
}
