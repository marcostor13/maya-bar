import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { ATTR_KEY, CONSENT_KEY, MetaTrackingService, isTrackedPath } from './meta-tracking.service';
import { setHostForTests } from '../shared/custom-domain';

type W = Window & { fbq?: ((...a: unknown[]) => void) & { queue?: unknown[][] } };

function make(pixel = '999') {
  (environment as { metaPixelId: string }).metaPixelId = pixel;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  return TestBed.inject(MetaTrackingService);
}
const calls = () => ((window as W).fbq?.queue ?? []).map((a) => [a[0], a[1]]);
const fbScripts = () => document.querySelectorAll('script[src*="fbevents.js"]').length;

describe('MetaTrackingService (HU84)', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as W).fbq;
    delete (window as W & { _fbq?: unknown })._fbq;
    document.querySelectorAll('script[src*="fbevents.js"]').forEach((s) => s.remove());
    setHostForTests('mayacrm.site');
  });
  afterEach(() => {
    (environment as { metaPixelId: string }).metaPixelId = '';
    setHostForTests(null);
  });

  it('solo mide en páginas públicas', () => {
    expect(isTrackedPath('/')).toBe(true);
    expect(isTrackedPath('/comparar/kommo?utm_source=x')).toBe(true);
    expect(isTrackedPath('/register#form')).toBe(true);
    expect(isTrackedPath('/dashboard')).toBe(false);
    expect(isTrackedPath('/e/mi-evento')).toBe(false);
  });

  it('sin consentimiento no carga el píxel y muestra el aviso; al aceptar carga y manda PageView', () => {
    const t = make();
    t.onPage('/');
    expect(t.bannerVisible()).toBe(true);
    expect(fbScripts()).toBe(0);
    expect((window as W).fbq).toBeUndefined();
    t.accept();
    expect(localStorage.getItem(CONSENT_KEY)).toBe('all');
    expect(t.bannerVisible()).toBe(false);
    expect(fbScripts()).toBe(1);
    expect(calls()).toEqual(expect.arrayContaining([['init', '999'], ['track', 'PageView']]));
    // El píxel no debe mandar PageView por su cuenta en la navegación de la SPA.
    expect(((window as W).fbq as unknown as { disablePushState?: boolean }).disablePushState).toBe(true);
    t.reopen();
    expect(calls()).toContainEqual(['consent', 'revoke']);
  });

  it('saltar a una sección de la misma página no manda otro PageView', () => {
    localStorage.setItem(CONSENT_KEY, 'all');
    const t = make();
    t.init();
    t.onPage('/?utm_source=x');
    t.onPage('/?utm_source=x#precios');
    t.onPage('/register');
    const views = calls().filter((c) => c[1] === 'PageView').length;
    expect(views).toBe(2);
  });

  it('"Solo necesarias" nunca carga el píxel', () => {
    const t = make();
    t.onPage('/');
    t.reject();
    t.onPage('/recursos');
    t.trackRegistration('reg_1');
    expect(fbScripts()).toBe(0);
    expect(t.bannerVisible()).toBe(false);
  });

  it('nada en rutas privadas, en dominios de clientes ni sin píxel configurado', () => {
    localStorage.setItem(CONSENT_KEY, 'all');
    let t = make();
    (t as unknown as { consent: { set: (v: string) => void } }).consent.set('all');
    t.onPage('/dashboard');
    expect(fbScripts()).toBe(0);
    setHostForTests('eventos.cliente.com');
    t.onPage('/');
    expect(fbScripts()).toBe(0);
    setHostForTests('mayacrm.site');
    t = make('');
    t.onPage('/');
    expect(t.bannerVisible()).toBe(false);
    expect(fbScripts()).toBe(0);
  });

  it('Contact al pulsar un enlace a wa.me y CompleteRegistration con el event_id del servidor', () => {
    const t = make();
    t.init();
    t.accept();
    t.onPage('/');
    const a = document.createElement('a');
    a.href = 'https://wa.me/51999999999?text=hola';
    a.addEventListener('click', (e) => e.preventDefault());
    document.body.appendChild(a);
    a.click();
    a.remove();
    t.trackRegistration('reg_abc');
    const q = (window as W).fbq!.queue!;
    expect(q.some((c) => c[0] === 'track' && c[1] === 'Contact')).toBe(true);
    expect(q).toContainEqual(['track', 'CompleteRegistration', { content_name: 'Registro prueba 14 días' }, { eventID: 'reg_abc' }]);
  });

  it('atribución de primer toque: guarda UTM y fbclid; una campaña posterior no la pisa', () => {
    const t = make();
    t.captureAttribution('?utm_source=facebook&utm_campaign=ctwa&fbclid=XYZ', '/industrias/clinicas', '', 1000);
    t.captureAttribution('?utm_source=google', '/', '', 2000);
    const a = JSON.parse(localStorage.getItem(ATTR_KEY)!);
    expect(a).toMatchObject({ utm_source: 'facebook', utm_campaign: 'ctwa', fbclid: 'XYZ', landingPath: '/industrias/clinicas', at: 1000 });
  });

  it('el registro lleva UTM siempre y los identificadores de Meta solo con consentimiento', () => {
    const t = make();
    t.captureAttribution('?utm_source=facebook&fbclid=XYZ', '/', '');
    const at = JSON.parse(localStorage.getItem(ATTR_KEY)!).at;
    expect(t.acquisition()).toEqual({ consent: false, utmSource: 'facebook', landingPath: '/' });
    t.accept();
    expect(t.acquisition()).toMatchObject({ consent: true, utmSource: 'facebook', fbclid: 'XYZ', fbc: `fb.1.${at}.XYZ` });
  });
});
