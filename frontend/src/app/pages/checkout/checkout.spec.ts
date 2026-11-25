import { TestBed } from '@angular/core/testing';
import { Component, input, output } from '@angular/core';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CheckoutComponent } from './checkout';
import { CheckoutResultComponent } from './checkout-result';
import { isValidRuc } from './ruc';
import { ToastService } from '../../shared/toast';
import { AuthService } from '../../auth/auth.service';
import { TurnstileComponent } from '../../shared/turnstile';
import { environment } from '../../../environments/environment';

@Component({ selector: 'app-turnstile', standalone: true, template: '' })
class TurnstileStub {
  siteKey = input<string>();
  token = output<string | null>();
  reset() { /* stub */ }
}

const API = environment.apiUrl;
const toast = { success: vi.fn(), error: vi.fn() };

let ctrl: HttpTestingController | undefined;

function setup(query: Record<string, string>, user: object | null = null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { currentUser: () => user } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  TestBed.overrideComponent(CheckoutComponent, { remove: { imports: [TurnstileComponent] }, add: { imports: [TurnstileStub] } });
  ctrl = TestBed.inject(HttpTestingController);
  return ctrl;
}

describe('Checkout (HU46)', () => {
  afterEach(() => { const c = ctrl; ctrl = undefined; c?.verify(); });

  it('isValidRuc comprueba el dígito verificador', () => {
    expect(isValidRuc('20123456786')).toBe(true);
    expect(isValidRuc('20123456789')).toBe(false);
  });

  it('C1: muestra subtotal, IGV y total del plan pedido en la URL', async () => {
    const http = setup({ plan: 'inicia', periodo: 'mensual' });
    const f = TestBed.createComponent(CheckoutComponent);
    f.detectChanges();
    const req = http.expectOne(r => r.url === `${API}/public/checkout/quote`);
    expect(req.request.params.get('plan')).toBe('inicia');
    expect(req.request.params.get('period')).toBe('mensual');
    req.flush({ plan: 'inicia', planName: 'Inicia', period: 'monthly', currency: 'PEN', subtotal: 99, igv: 17.82, total: 116.82, mode: 'subscription' });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="igv"]')!.textContent).toContain('17.82');
    expect(el.querySelector('[data-testid="total"]')!.textContent).toContain('116.82');
  });

  it('HU54: con ?cupon=FUNDADOR cotiza con el descuento; si el cupón no aplica muestra el motivo y cotiza sin él', async () => {
    const http = setup({ plan: 'crece', periodo: 'anual', cupon: 'fundador' });
    const f = TestBed.createComponent(CheckoutComponent);
    f.detectChanges();
    const req = http.expectOne(r => r.url === `${API}/public/checkout/quote`);
    expect(req.request.params.get('coupon')).toBe('FUNDADOR');
    req.flush({ plan: 'crece', planName: 'Crece', period: 'annual', currency: 'PEN', subtotal: 1743, igv: 313.74, total: 2056.74, mode: 'one_time',
      listSubtotal: 2490, discount: 747, couponCode: 'FUNDADOR' });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="discount"]')!.textContent).toContain('747.00');
    expect(el.querySelector('[data-testid="total"]')!.textContent).toContain('2,056.74');

    // Cambia a mensual: FUNDADOR no aplica.
    (f.componentInstance as unknown as { setPeriod(p: string): void }).setPeriod('mensual');
    http.expectOne(r => r.url === `${API}/public/checkout/quote` && r.params.get('coupon') === 'FUNDADOR')
      .flush({ message: 'Este cupón es solo para pago trimestral o anual' }, { status: 400, statusText: 'Bad' });
    http.expectOne(r => r.url === `${API}/public/checkout/quote` && !r.params.has('coupon'))
      .flush({ plan: 'crece', planName: 'Crece', period: 'monthly', currency: 'PEN', subtotal: 249, igv: 44.82, total: 293.82, mode: 'subscription' });
    f.detectChanges();
    expect(el.querySelector('#coupon-error')!.textContent).toContain('solo para pago trimestral o anual');
    expect(toast.error).toHaveBeenCalledWith('Este cupón es solo para pago trimestral o anual');
    expect(el.querySelector('[data-testid="discount"]')).toBeNull();

    // Vuelve a anual: el cupón escrito se prueba otra vez solo.
    (f.componentInstance as unknown as { setPeriod(p: string): void }).setPeriod('anual');
    http.expectOne(r => r.url === `${API}/public/checkout/quote` && r.params.get('coupon') === 'FUNDADOR')
      .flush({ plan: 'crece', planName: 'Crece', period: 'annual', currency: 'PEN', subtotal: 1743, igv: 313.74, total: 2056.74, mode: 'one_time', listSubtotal: 2490, discount: 747, couponCode: 'FUNDADOR' });
    f.detectChanges();
    expect(el.querySelector('[data-testid="discount"]')).not.toBeNull();
    expect((f.componentInstance as unknown as { appliedCoupon(): string }).appliedCoupon()).toBe('FUNDADOR');
  });

  it('HU55: elegir Puesta en marcha en anual muestra la línea, su descuento y lo que se paga hoy', async () => {
    const http = setup({ plan: 'crece', periodo: 'anual' });
    const f = TestBed.createComponent(CheckoutComponent);
    f.detectChanges();
    http.expectOne(r => r.url === `${API}/public/checkout/quote`)
      .flush({ plan: 'crece', planName: 'Crece', period: 'annual', currency: 'PEN', subtotal: 2490, igv: 448.2, total: 2938.2, mode: 'one_time' });
    (f.componentInstance as unknown as { setSetup(id: string): void }).setSetup('puesta');
    const req = http.expectOne(r => r.url === `${API}/public/checkout/quote`);
    expect(req.request.params.get('setup')).toBe('puesta');
    req.flush({ plan: 'crece', planName: 'Crece', period: 'annual', currency: 'PEN', subtotal: 2490, igv: 448.2, total: 2938.2, mode: 'one_time',
      setup: { id: 'puesta', name: 'Puesta en marcha', price: 490, discount: 249, subtotal: 241, igv: 43.38, total: 284.38 }, dueToday: 3222.58 });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Puesta en marcha');
    expect(el.querySelector('[data-testid="setup-discount"]')!.textContent).toContain('249.00');
    expect(el.querySelector('[data-testid="due-today"]')!.textContent).toContain('3,222.58');
  });

  it('C2: con un RUC inválido no se puede pagar y se explica por qué', async () => {
    const http = setup({});
    const f = TestBed.createComponent(CheckoutComponent);
    f.detectChanges();
    http.expectOne(r => r.url === `${API}/public/checkout/quote`).flush({ plan: 'crece', planName: 'Crece', period: 'monthly', currency: 'PEN', subtotal: 249, igv: 44.82, total: 293.82, mode: 'subscription' });
    const c = f.componentInstance;
    c.form.patchValue({
      buyer: { company: 'Acme', name: 'Ana', email: 'ana@x.pe' },
      billing: { docType: 'factura', docNumber: '20123456789', legalName: 'Acme SAC', address: 'Lima' },
      acceptTerms: true,
    });
    c.captchaToken.set('token-captcha');
    f.detectChanges();
    expect(c.canSubmit()).toBe(false);
    expect((f.nativeElement as HTMLElement).querySelector('[data-testid="doc-error"]')!.textContent).toContain('RUC');

    c.form.controls.billing.patchValue({ docNumber: '20123456786' });
    f.detectChanges();
    expect(c.canSubmit()).toBe(true);
  });

  it('desde la cuenta usa /billing/checkout y precarga los datos', async () => {
    const http = setup({ plan: 'escala' }, { role: 'TENANT_ADMIN', name: 'Ana', email: 'ana@x.pe' });
    const f = TestBed.createComponent(CheckoutComponent);
    f.detectChanges();
    http.expectOne(r => r.url === `${API}/billing/checkout/quote`).flush({ plan: 'escala', planName: 'Escala', period: 'monthly', currency: 'PEN', subtotal: 549, igv: 98.82, total: 647.82, mode: 'subscription' });
    http.expectOne(`${API}/billing/info`).flush({ docType: 'boleta', docNumber: '12345678', legalName: 'Ana Pérez' });
    const c = f.componentInstance;
    expect(c.form.controls.buyer.controls.email.value).toBe('ana@x.pe');
    c.form.patchValue({ buyer: { company: 'Acme' }, acceptTerms: true });
    c.submit();
    const post = http.expectOne(`${API}/billing/checkout`);
    expect(post.request.body).toMatchObject({ plan: 'escala', billing: { docNumber: '12345678' } });
    post.flush({ message: 'Mercado Pago no respondió' }, { status: 400, statusText: 'Bad Request' });
    expect(toast.error).toHaveBeenCalled();
  });

  it('HU76: muestra el sello de pago seguro; en mensual solo tarjetas, en pago único también Yape', async () => {
    const http = setup({ plan: 'crece', periodo: 'mensual' });
    const f = TestBed.createComponent(CheckoutComponent);
    f.detectChanges();
    http.expectOne(r => r.url === `${API}/public/checkout/quote`).flush({ plan: 'crece', planName: 'Crece', period: 'monthly', currency: 'PEN', subtotal: 249, igv: 44.82, total: 293.82, mode: 'subscription' });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Pago seguro procesado por');
    expect(el.querySelector('[aria-label="Mercado Pago"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Visa"]')).not.toBeNull();
    expect(el.querySelector('[title="Yape"]')).toBeNull();
    // El monto del botón y de la barra móvil es el total del plan.
    expect(el.querySelector('.pay-main')!.textContent).toContain('S/ 293.82');
    expect(el.querySelector('.mobile-bar')!.textContent).toContain('S/ 293.82');

    f.componentInstance.setPeriod('anual');
    http.expectOne(r => r.url === `${API}/public/checkout/quote`).flush({ plan: 'crece', planName: 'Crece', period: 'annual', currency: 'PEN', subtotal: 2490, igv: 448.2, total: 2938.2, mode: 'one_time' });
    f.detectChanges();
    expect(el.querySelector('[title="Yape"]')).not.toBeNull();
    expect(el.querySelector('[role="radio"][aria-checked="true"]')!.textContent).toContain('Crece');
  });

  it('HU76: el cupón se abre a pedido y llega abierto si viene en la URL', async () => {
    const http = setup({ plan: 'crece', periodo: 'mensual' });
    const f = TestBed.createComponent(CheckoutComponent);
    f.detectChanges();
    http.expectOne(r => r.url === `${API}/public/checkout/quote`).flush({ plan: 'crece', planName: 'Crece', period: 'monthly', currency: 'PEN', subtotal: 249, igv: 44.82, total: 293.82, mode: 'subscription' });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.coupon .input')).toBeNull();
    (el.querySelector('.coupon-toggle') as HTMLButtonElement).click();
    f.detectChanges();
    expect(el.querySelector('.coupon .input')).not.toBeNull();
  });

  it('HU76: con ?cupon= el cupón llega abierto y aplicado', async () => {
    const http = setup({ plan: 'crece', periodo: 'anual', cupon: 'lanza' });
    const f = TestBed.createComponent(CheckoutComponent);
    f.detectChanges();
    http.expectOne(r => r.url === `${API}/public/checkout/quote` && r.params.get('coupon') === 'LANZA')
      .flush({ plan: 'crece', planName: 'Crece', period: 'annual', currency: 'PEN', subtotal: 2490, igv: 448.2, total: 2938.2, mode: 'one_time', couponCode: 'LANZA' });
    f.detectChanges();
    expect(f.componentInstance.couponOpen()).toBe(true);
    expect((f.nativeElement as HTMLElement).textContent).toContain('LANZA');
  });
});

describe('Resultado del checkout (HU46)', () => {
  afterEach(() => { const c = ctrl; ctrl = undefined; c?.verify(); });

  function render(query: Record<string, string>) {
    const http = setup(query);
    const f = TestBed.createComponent(CheckoutResultComponent);
    f.detectChanges();
    return { http, f, el: f.nativeElement as HTMLElement };
  }
  const base = { planName: 'Inicia', period: 'monthly', total: 116.82, currency: 'PEN', mode: 'subscription', existingAccount: false };

  it('C3: status=approved en la URL no basta: sigue "Confirmando" mientras el servidor diga pendiente', () => {
    const { http, f, el } = render({ session: 'abc', status: 'approved', collection_status: 'approved' });
    http.expectOne(`${API}/public/checkout/abc`).flush({ ...base, status: 'pending' });
    f.detectChanges();
    expect(el.textContent).toContain('Confirmando tu pago');
    expect(el.textContent).not.toContain('Listo');
    f.destroy();
  });

  it('pagado pero sin cuenta lista todavía → "Activando", no "Listo"', () => {
    const { http, f, el } = render({ session: 'abc' });
    http.expectOne(`${API}/public/checkout/abc`).flush({ ...base, status: 'paid' });
    f.detectChanges();
    expect(el.textContent).toContain('Activando');
    expect(el.textContent).not.toContain('Listo');
    f.destroy();
  });

  it('cuenta activa (fulfilled) → "Listo: revisa tu correo"', () => {
    const { http, f, el } = render({ session: 'abc' });
    http.expectOne(`${API}/public/checkout/abc`).flush({ ...base, status: 'fulfilled' });
    f.detectChanges();
    expect(el.textContent).toContain('Listo');
    expect(el.textContent).toContain('correo');
  });

  it('C4: PagoEfectivo pendiente dice cómo pagar y que el acceso llega por correo', () => {
    const { http, f, el } = render({ session: 'abc' });
    http.expectOne(`${API}/public/checkout/abc`).flush({ ...base, status: 'awaiting_payment', paymentMethod: 'ticket' });
    f.detectChanges();
    const text = el.querySelector('[data-testid="pagoefectivo"]')!.textContent!;
    expect(text).toContain('PagoEfectivo');
    expect(text).toContain('correo');
    f.destroy();
  });

  it('rechazado → "Intentar de nuevo"', () => {
    const { http, f, el } = render({ session: 'abc' });
    http.expectOne(`${API}/public/checkout/abc`).flush({ ...base, plan: 'inicia', status: 'rejected' });
    f.detectChanges();
    expect(el.textContent).toContain('Intentar de nuevo');
    expect(el.querySelector('a[href*="/checkout"]')!.getAttribute('href')).toContain('plan=inicia');
  });
});
