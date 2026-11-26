import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../environments/environment';
import { CONTENT_SLUGS } from '../pages/content/content.slugs';
import { currentHost, isPlatformHost } from '../shared/custom-domain';

export type ConsentChoice = 'all' | 'necessary';

export const CONSENT_KEY = 'maya_consent_v1';
export const ATTR_KEY = 'maya_attr_v1';
const ATTR_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

/** Páginas públicas donde se mide; la app privada y las páginas de clientes nunca. */
const PUBLIC_PATHS = new Set([
  '/', '/register', '/login', '/checkout', '/recursos', '/privacidad', '/terminos', '/eliminacion-datos',
  ...CONTENT_SLUGS.map((s) => `/${s}`),
]);

export function isTrackedPath(url: string): boolean {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return PUBLIC_PATHS.has(path);
}

/** Primer toque guardado en el navegador. */
export interface StoredAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  landingPath?: string;
  referrer?: string;
  at: number;
}

/** Lo que viaja con el registro (`acquisition` del backend). */
export interface AcquisitionPayload {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  landingPath?: string;
  referrer?: string;
  consent: boolean;
}

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown;
  disablePushState?: boolean; allowDuplicatePageViews?: boolean;
};

/**
 * Medición de la publicidad propia en Meta (HU84): guarda el origen de la
 * visita (UTM y `fbclid`), pide consentimiento y, solo si se acepta, carga el
 * píxel y manda `PageView`, `ViewContent` (precios), `Contact` (WhatsApp) y
 * `CompleteRegistration` con el mismo `event_id` que la API de conversiones.
 */
@Injectable({ providedIn: 'root' })
export class MetaTrackingService {
  private router = inject(Router);
  private doc = inject(DOCUMENT);
  private browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly pixelId = environment.metaPixelId ?? '';

  readonly consent = signal<ConsentChoice | null>(null);
  readonly bannerVisible = signal(false);
  private pixelLoaded = false;
  private pricingSeen = false;
  private pricingObserver?: IntersectionObserver;
  private currentUrl = '/';
  /** Última página que ya mandó PageView, sin el `#ancla`. */
  private trackedPage: string | null = null;
  private started = false;

  init(): void {
    if (!this.browser || this.started) return;
    this.started = true;
    this.consent.set(this.readConsent());
    const loc = this.doc.location;
    this.captureAttribution(loc.search, loc.pathname, this.doc.referrer);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.onPage(e.urlAfterRedirects));
    this.doc.addEventListener('click', (ev) => this.onClick(ev), true);
    // Con hidratación la primera navegación puede haber terminado ya.
    if (this.router.navigated) this.onPage(this.router.url);
  }

  /** La página actual es del sitio público de Maya CRM y hay píxel configurado. */
  private eligible(url = this.currentUrl): boolean {
    return !!this.pixelId && isPlatformHost(currentHost()) && isTrackedPath(url);
  }

  private get active(): boolean {
    return this.consent() === 'all' && this.eligible();
  }

  onPage(url: string): void {
    this.currentUrl = url;
    this.pricingObserver?.disconnect();
    this.bannerVisible.set(this.eligible(url) && this.consent() === null);
    if (!this.active) return;
    this.ensurePixel();
    // Saltar a una sección de la misma página (`/#precios`) no es otra visita.
    const page = url.split('#')[0];
    if (page !== this.trackedPage) {
      this.trackedPage = page;
      this.fbq('track', 'PageView');
    }
    this.watchPricing();
  }

  accept(): void {
    this.setConsent('all');
    if (this.pixelLoaded) this.fbq('consent', 'grant');
    this.onPage(this.currentUrl);
  }

  reject(): void {
    this.setConsent('necessary');
    this.revoke();
  }

  /** "Preferencias de cookies": vuelve a preguntar. */
  reopen(): void {
    try { localStorage.removeItem(CONSENT_KEY); } catch { /* sin almacenamiento */ }
    this.consent.set(null);
    this.revoke();
    this.bannerVisible.set(this.eligible());
  }

  /** Si el píxel ya estaba cargado, deja de enviar nada hasta un nuevo "Aceptar". */
  private revoke(): void {
    if (this.pixelLoaded) this.fbq('consent', 'revoke');
  }

  trackRegistration(eventId?: string): void {
    if (!eventId || this.consent() !== 'all' || !this.pixelId || !isPlatformHost(currentHost())) return;
    this.ensurePixel();
    this.fbq('track', 'CompleteRegistration', { content_name: 'Registro prueba 14 días' }, { eventID: eventId });
  }

  /** Datos de origen para el registro. Sin consentimiento no viajan los identificadores de Meta. */
  acquisition(): AcquisitionPayload {
    const a = this.readAttribution();
    const consent = this.consent() === 'all';
    const out: AcquisitionPayload = { consent };
    if (a) {
      if (a.utm_source) out.utmSource = a.utm_source;
      if (a.utm_medium) out.utmMedium = a.utm_medium;
      if (a.utm_campaign) out.utmCampaign = a.utm_campaign;
      if (a.utm_content) out.utmContent = a.utm_content;
      if (a.utm_term) out.utmTerm = a.utm_term;
      if (a.landingPath) out.landingPath = a.landingPath;
      if (a.referrer) out.referrer = a.referrer;
    }
    if (consent) {
      const fbc = this.cookie('_fbc') ?? (a?.fbclid ? `fb.1.${a.at}.${a.fbclid}` : undefined);
      const fbp = this.cookie('_fbp');
      if (a?.fbclid) out.fbclid = a.fbclid;
      if (fbc) out.fbc = fbc;
      if (fbp) out.fbp = fbp;
    }
    return out;
  }

  /** Primer toque de los últimos 90 días. */
  captureAttribution(search: string, path: string, referrer: string, now = Date.now()): void {
    const q = new URLSearchParams(search);
    const fresh: StoredAttribution = { at: now };
    for (const k of UTM_KEYS) {
      const v = q.get(k);
      if (v) fresh[k] = v.slice(0, 200);
    }
    const fbclid = q.get('fbclid');
    if (fbclid) fresh.fbclid = fbclid.slice(0, 500);
    const hasCampaign = Object.keys(fresh).length > 1;
    const prev = this.readAttribution(now);
    // Una visita con campaña reemplaza a una directa, nunca a otra campaña.
    if (prev && (!hasCampaign || prev.utm_source || prev.fbclid)) return;
    fresh.landingPath = path.slice(0, 300);
    if (referrer && !referrer.includes(this.doc.location?.host || '\u0000')) fresh.referrer = referrer.slice(0, 500);
    try { localStorage.setItem(ATTR_KEY, JSON.stringify(fresh)); } catch { /* sin almacenamiento */ }
  }

  readAttribution(now = Date.now()): StoredAttribution | null {
    try {
      const raw = localStorage.getItem(ATTR_KEY);
      if (!raw) return null;
      const a = JSON.parse(raw) as StoredAttribution;
      return typeof a.at === 'number' && now - a.at < ATTR_TTL_MS ? a : null;
    } catch {
      return null;
    }
  }

  private onClick(ev: Event): void {
    const a = (ev.target as Element | null)?.closest?.('a[href*="wa.me/"]');
    if (a && this.active) this.fbq('track', 'Contact', { content_name: 'WhatsApp' });
  }

  private watchPricing(): void {
    if (this.pricingSeen || typeof IntersectionObserver === 'undefined') return;
    setTimeout(() => {
      const el = this.doc.getElementById('precios');
      if (!el || this.pricingSeen) return;
      this.pricingObserver = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting) || this.pricingSeen || !this.active) return;
        this.pricingSeen = true;
        this.pricingObserver?.disconnect();
        this.fbq('track', 'ViewContent', { content_name: 'Precios', content_category: 'planes' });
      }, { threshold: 0.25 });
      this.pricingObserver.observe(el);
    }, 0);
  }

  private setConsent(c: ConsentChoice): void {
    try { localStorage.setItem(CONSENT_KEY, c); } catch { /* sin almacenamiento */ }
    this.consent.set(c);
    this.bannerVisible.set(false);
  }

  private readConsent(): ConsentChoice | null {
    try {
      const v = localStorage.getItem(CONSENT_KEY);
      return v === 'all' || v === 'necessary' ? v : null;
    } catch {
      return null;
    }
  }

  private cookie(name: string): string | undefined {
    const m = this.doc.cookie?.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : undefined;
  }

  /** Código base del píxel de Meta, cargado solo tras el consentimiento. */
  private ensurePixel(): void {
    if (this.pixelLoaded) return;
    this.pixelLoaded = true;
    const w = this.doc.defaultView as (Window & { fbq?: Fbq; _fbq?: Fbq }) | null;
    if (!w) return;
    if (!w.fbq) {
      const n: Fbq = function (...args: unknown[]) {
        if (n.callMethod) (n.callMethod as (...a: unknown[]) => void)(...args);
        else n.queue!.push(args);
      } as Fbq;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      // Sin esto el píxel manda su propio PageView en cada cambio de ruta de
      // la SPA, también en la app privada. Los PageView los manda onPage().
      n.disablePushState = true;
      n.allowDuplicatePageViews = true;
      w.fbq = n;
      w._fbq = n;
      const s = this.doc.createElement('script');
      s.async = true;
      s.src = 'https://connect.facebook.net/en_US/fbevents.js';
      this.doc.head.appendChild(s);
    }
    this.fbq('set', 'autoConfig', false, this.pixelId);
    this.fbq('init', this.pixelId);
  }

  private fbq(...args: unknown[]): void {
    (this.doc.defaultView as (Window & { fbq?: Fbq }) | null)?.fbq?.(...args);
  }
}
