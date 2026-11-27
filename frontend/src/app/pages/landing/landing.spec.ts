import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LandingComponent } from './landing';
import { PLANS, ADDONS, SETUP_PACKAGES } from './landing.data';
import CATALOG from '../../shared/catalog.generated.json';

/** HU56: precios de la landing desde el catálogo. */
describe('Landing: precios (HU56)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function render() {
    await TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const f = TestBed.createComponent(LandingComponent);
    f.detectChanges();
    await f.whenStable();
    return { f, el: f.nativeElement as HTMLElement };
  }

  it('C1: el HTML trae los precios en soles de Inicia y Crece', async () => {
    const { el } = await render();
    const text = el.textContent!;
    expect(text).toContain('S/ 99');
    expect(text).toContain('S/ 249');
  });

  it('HU87 C5: no ofrece prueba gratis y los CTA llevan a la demo por WhatsApp o al checkout', async () => {
    const { el } = await render();
    expect(el.textContent).not.toMatch(/14 d[ií]as|prueba gratis|sin tarjeta|Crear cuenta/i);
    expect(el.querySelector('a[href*="/register"]')).toBeNull();
    expect(el.querySelectorAll('a[href*="wa.me/"]').length).toBeGreaterThan(2);
  });

  it('C2: el botón de Crece en anual lleva al checkout de Crece anual', async () => {
    const { f, el } = await render();
    const annual = [...el.querySelectorAll('.billing-toggle button')].find(b => b.textContent!.includes('Anual')) as HTMLButtonElement;
    annual.click();
    f.detectChanges();
    const href = el.querySelector('[data-buy="crece"]')!.getAttribute('href')!;
    expect(href).toContain('/checkout?plan=crece&periodo=anual');
  });

  it('HU77: en anual tacha el precio mensual de lista y muestra el sello de pago seguro', async () => {
    const { f, el } = await render();
    expect(el.querySelector('.plan-price .was')).toBeNull();
    // El mensual es suscripción: solo tarjetas.
    expect(el.querySelector('.pay-trust [title="Yape"]')).toBeNull();
    const annual = [...el.querySelectorAll('.billing-toggle button')].find(b => b.textContent!.includes('Anual')) as HTMLButtonElement;
    annual.click();
    f.detectChanges();
    const crece = CATALOG.plans.find(p => p.id === 'crece')!.prices.USD!;
    const card = el.querySelector('[data-buy="crece"]')!.closest('.plan-card')!;
    expect(card.querySelector('.was')!.textContent).toContain(String(crece.monthly));
    expect(el.querySelector('.pay-trust [aria-label="Mercado Pago"]')).not.toBeNull();
    expect(el.querySelector('.pay-trust [title="Yape"]')).not.toBeNull();
  });

  it('trimestral muestra el equivalente mensual con el −5 % y el total del trimestre', async () => {
    const { f, el } = await render();
    const q = [...el.querySelectorAll('.billing-toggle button')].find(b => b.textContent!.includes('Trimestral')) as HTMLButtonElement;
    q.click();
    f.detectChanges();
    const crece = CATALOG.plans.find(p => p.id === 'crece')!.prices.USD!;
    expect(el.textContent).toContain(`US$${crece.quarterly} cada 3 meses`);
    expect(el.querySelector('[data-buy="crece"]')!.getAttribute('href')).toContain('periodo=trimestral');
  });

  it('en soles (zona de Lima) el botón lleva moneda=PEN y el precio de Crece en S/', async () => {
    const tz = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'America/Lima' } as Intl.ResolvedDateTimeFormatOptions);
    try { localStorage.removeItem('maya-landing-currency'); } catch { /* sin almacenamiento */ }
    const { f, el } = await render();
    f.detectChanges();
    tz.mockRestore();
    expect(el.querySelector('[data-buy="crece"]')!.getAttribute('href')).toContain('moneda=PEN');
    const crece = CATALOG.plans.find(p => p.id === 'crece')!.prices.PEN!;
    expect(el.textContent).toContain(String(crece.monthly));
  });

  it('muestra los cupos fundador con el enlace al checkout con el cupón', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ active: true, remaining: 37 }) }));
    const { f, el } = await render();
    await new Promise(r => setTimeout(r));
    f.detectChanges();
    const banner = el.querySelector('.founder')!;
    expect(banner.textContent).toContain('37');
    expect(banner.querySelector('a')!.getAttribute('href')).toContain('cupon=FUNDADOR');
  });

  it('C3: planes, add-ons e implementación salen del catálogo generado', () => {
    for (const id of ['inicia', 'crece', 'escala']) {
      const c = CATALOG.plans.find(p => p.id === id)!;
      const p = PLANS.find(x => x.id === id)!;
      expect(p.prices).toEqual({ usd: c.prices.USD, pen: c.prices.PEN });
    }
    expect(ADDONS.map(a => a.name)).toEqual(CATALOG.addons.map(a => a.name));
    expect(SETUP_PACKAGES[1].price.pen).toBe(`S/ ${CATALOG.setup.packages[0].price.PEN}`);
    // Las cifras del copy también salen del catálogo.
    const crece = CATALOG.plans.find(p => p.id === 'crece')!;
    const features = PLANS.find(x => x.id === 'crece')!.features.join(' ');
    expect(features).toContain(`${crece.limits.aiAgents} agentes de IA`);
  });
});
