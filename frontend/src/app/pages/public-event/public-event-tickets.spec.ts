import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { PublicEventComponent } from './public-event';

const EVENT = {
  _id: 'e1', title: 'Fiesta', date: '2030-12-31', capacity: 0, price: 30, status: 'published', onlinePayment: true,
  ticketTypes: [
    { key: 'general', name: 'General', price: 30, capacity: 2, sold: 2, salesEndAt: null },
    { key: 'vip', name: 'VIP', price: 80, capacity: 10, sold: 3, salesEndAt: null },
    { key: 'preventa', name: 'Preventa', price: 20, capacity: 0, sold: 0, salesEndAt: '2020-01-01T00:00:00.000Z' },
  ],
};

describe('Landing del evento: compra de entradas en línea (HU67)', () => {
  let fixture: ComponentFixture<PublicEventComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  async function setup(query: Record<string, string> = {}, online = true) {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [PublicEventComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ slug: 'fiesta' }), queryParamMap: convertToParamMap(query) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PublicEventComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/public/events/fiesta')).flush({ event: EVENT, registrationsCount: 0, payments: { online } });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => { http.verify(); vi.restoreAllMocks(); localStorage.clear(); });

  it('muestra los tipos a la venta, marca el agotado, elige el primero disponible y paga en Mercado Pago', async () => {
    await setup();
    const c = fixture.componentInstance;
    expect(c.cta()).toBe('Comprar entrada · desde S/ 30');
    c.openForm();
    fixture.detectChanges();
    const labels = Array.from(el().querySelectorAll('.pe-ticket')).map((l) =>
      Array.from(l.querySelectorAll('span')).map((x) => x.textContent!.trim()).join(' '));
    expect(labels).toEqual(['General S/ 30 Agotada', 'VIP S/ 80 Quedan 7']);
    expect(c.ticketType()).toBe('vip');

    c.quantity.set(2);
    fixture.detectChanges();
    expect(el().textContent).toContain('Total S/ 160');
    expect(c.submitLabel()).toBe('Pagar S/ 160');

    const redirect = vi.spyOn(c, 'redirect').mockImplementation(() => undefined);
    c.form.patchValue({ name: 'Ana', email: 'ana@x.pe', phone: '' });
    c.submitRegistration();
    const req = http.expectOne((r) => r.url.endsWith('/public/events/e1/checkout'));
    expect(req.request.body).toEqual({ ticketType: 'vip', quantity: 2, name: 'Ana', email: 'ana@x.pe', customFields: {} });
    req.flush({ registrationId: 'r1', ticketCode: 'ABC12345', amount: 160, currency: 'PEN', initPoint: 'https://mp/checkout', paymentStatus: 'pending' });
    expect(redirect).toHaveBeenCalledWith('https://mp/checkout');
    expect(localStorage.getItem('pe-ticket:e1') ?? JSON.stringify(Object.values(localStorage))).toContain('ABC12345');
  });

  it('si se agota al pagar muestra el error del servidor', async () => {
    await setup();
    const c = fixture.componentInstance;
    c.form.patchValue({ name: 'Ana', email: 'ana@x.pe' });
    c.submitRegistration();
    http.expectOne((r) => r.url.endsWith('/checkout')).flush({ message: 'Se agotaron las entradas "VIP"' }, { status: 409, statusText: 'Conflict' });
    expect(c.formError()).toBe('Se agotaron las entradas "VIP"');
    expect(c.submitting()).toBe(false);
  });

  it('al volver con pago fallido avisa y no da la entrada por válida', async () => {
    localStorage.setItem('x', 'y');
    await setup({ pago: 'error', t: 'ABC12345' });
    const c = fixture.componentInstance;
    expect(c.paymentNotice()).toContain('no se completó');
    expect(c.registered()).toBe(false);
  });

  it('sin cuenta de cobro conectada sigue con la reserva y pago en el local', async () => {
    await setup({}, false);
    const c = fixture.componentInstance;
    expect(c.online()).toBe(false);
    expect(c.cta()).toBe('Reservar entrada · S/ 30');
  });
});
