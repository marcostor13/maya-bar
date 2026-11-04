import { BadRequestException, Injectable, Logger } from '@nestjs/common';

/** Producto tal como se le entrega al modelo (ya limpio y en soles). */
export interface StoreProduct {
  id: number;
  nombre: string;
  precio: string;
  /** Solo si está en oferta (precio regular mayor al actual). */
  precio_regular: string | null;
  disponible: boolean;
  /** Unidades restantes cuando la tienda avisa de stock bajo. */
  stock_bajo: number | null;
  requiere_receta: boolean;
  link: string;
  tiene_foto: boolean;
}

/** Datos internos que no viajan al modelo: precio numérico, moneda y foto. */
export interface StoreProductFull extends StoreProduct {
  precioNum: number;
  moneda: string;
  foto?: string;
}

interface WooImage {
  src?: string;
  srcset?: string;
}

interface WooProduct {
  id: number;
  name?: string;
  permalink?: string;
  prices?: {
    price?: string;
    regular_price?: string;
    currency_minor_unit?: number;
    currency_symbol?: string;
  };
  is_in_stock?: boolean;
  is_purchasable?: boolean;
  low_stock_remaining?: number | null;
  categories?: { name?: string }[];
  images?: WooImage[];
}

const FIELDS =
  'id,name,permalink,prices,is_in_stock,is_purchasable,low_stock_remaining,categories,images';
const TIMEOUT_MS = 4000;
/** El stock cambia a cada rato: la caché solo evita repetir la misma búsqueda seguida. */
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 500;
/** Foto que se envía: nítida en el móvil y por debajo del límite de WhatsApp. */
const PHOTO_WIDTH = 1024;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** WooCommerce devuelve los nombres con entidades HTML (`&#8211;`). */
export function decodeHtml(s = ''): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1].toLowerCase() === 'x'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Del srcset, la versión más grande que no pase de 1024 px; si no hay, el original. */
export function pickPhoto(img?: WooImage): string | undefined {
  if (!img) return undefined;
  const best = (img.srcset ?? '')
    .split(',')
    .map((s) => {
      const [url, w] = s.trim().split(/\s+/);
      return { url, w: parseInt(w, 10) };
    })
    .filter((o) => o.url && o.w <= PHOTO_WIDTH)
    .sort((a, b) => b.w - a.w)[0];
  return best?.url || img.src || undefined;
}

/**
 * Normaliza la URL de la tienda y la rechaza si no es https pública: el
 * servidor la consulta, así que no puede apuntar a la red interna.
 */
export function normalizeStoreUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException('La URL de la tienda no es válida');
  }
  const host = url.hostname.toLowerCase();
  const isIp = /^[\d.]+$/.test(host) || host.includes(':');
  if (
    url.protocol !== 'https:' ||
    isIp ||
    !host.includes('.') ||
    /(^|\.)(localhost|local|internal|lan)$/.test(host)
  ) {
    throw new BadRequestException(
      'La tienda debe ser una dirección pública https, ej. https://mitienda.com',
    );
  }
  return `${url.origin}`;
}

/** "S/ 40.00": símbolo de la tienda, siempre con dos decimales. */
export function money(n: number, symbol = 'S/'): string {
  return `${symbol} ${n.toFixed(2)}`;
}

/**
 * Consulta en vivo una tienda WooCommerce por su Store API pública (sin
 * credenciales): precio, stock, link y foto de cada producto.
 */
@Injectable()
export class WooStoreService {
  private readonly logger = new Logger(WooStoreService.name);
  private readonly cache = new Map<
    string,
    { at: number; data: StoreProductFull[] }
  >();

  async search(storeUrl: string, query: string): Promise<StoreProductFull[]> {
    const base = normalizeStoreUrl(storeUrl);
    const term = query.trim();
    if (!term) return [];
    const key = `${base}|${term.toLowerCase()}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

    const url = `${base}/wp-json/wc/store/v1/products?search=${encodeURIComponent(term)}&per_page=8&_fields=${FIELDS}`;
    const items = await this.fetchWithRetry(url);
    const data = items.map((p) => this.toProduct(p));

    // El Map conserva el orden de inserción: la primera clave es la más vieja.
    if (this.cache.size >= CACHE_MAX) {
      for (const oldest of this.cache.keys()) {
        this.cache.delete(oldest);
        break;
      }
    }
    this.cache.set(key, { at: Date.now(), data });
    return data;
  }

  /** Un reintento inmediato; si vuelve a fallar, el agente aplica su plan B. */
  private async fetchWithRetry(url: string): Promise<WooProduct[]> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: unknown = await res.json();
        if (!Array.isArray(body)) throw new Error('respuesta inesperada');
        return body as WooProduct[];
      } catch (err) {
        lastErr = err;
      }
    }
    this.logger.warn(`La tienda no respondió (${url}): ${String(lastErr)}`);
    throw new Error('web_no_responde');
  }

  private toProduct(p: WooProduct): StoreProductFull {
    const div = 10 ** (p.prices?.currency_minor_unit ?? 2);
    const precio = Number(p.prices?.price ?? 0) / div;
    const regular = Number(p.prices?.regular_price ?? 0) / div;
    const foto = pickPhoto(p.images?.[0]);
    const symbol = decodeHtml(p.prices?.currency_symbol) || 'S/';
    return {
      id: p.id,
      nombre: decodeHtml(p.name),
      precio: money(precio, symbol),
      precio_regular: regular > precio ? money(regular, symbol) : null,
      disponible: Boolean(p.is_in_stock && p.is_purchasable),
      stock_bajo: p.low_stock_remaining ?? null,
      requiere_receta: (p.categories ?? []).some((c) =>
        /receta/i.test(c.name ?? ''),
      ),
      link: p.permalink ?? '',
      tiene_foto: Boolean(foto),
      precioNum: precio,
      moneda: symbol,
      foto,
    };
  }
}
