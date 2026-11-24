import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { PublicQuoteComponent, PublicQuote } from './public-quote';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/public/quotes/tok`;
const Q: PublicQuote = {
  number: 'COT-0001', status: 'viewed', currency: 'PEN', igvRate: 18, subtotal: 925.4, discount: 100, igv: 166.57, total: 1091.97,
  items: [{ name: 'Implementación CRM', quantity: 1, unitPrice: 1000, discountPct: 10, total: 1062 }],
  validUntil: '2030-01-31T00:00:00.000Z', expired: false, notes: 'Pago 50% adelantado', createdAt: '2026-11-24T10:00:00.000Z',
  canPay: true, company: { name: 'Consultora Andina', logo: '', color: '' }, customerName: 'Lucía', pdfUrl: 'https://api/x.pdf',
};

describe('Link público de la cotización (HU68)', () => {
  let fixture: ComponentFixture<PublicQuoteComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };
  const el = () => fixture.nativeElement as HTMLElement;

  async function setup(q: Partial<PublicQuote> = {}, query: Record<string, string> = {}) {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [PublicQuoteComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ token: 'tok' }), queryParamMap: convertToParamMap(query) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PublicQuoteComponent);
    fixture.detectChanges();
    http.expectOne(API).flush({ ...Q, ...q });
    fixture.detectChanges();
  }
  afterEach(() => http.verify());

  it('muestra ítems y totales; aceptar pide confirmación y recarga', async () => {
    await setup();
    const text = el().textContent!;
    for (const s of ['Cotización COT-0001', 'Consultora Andina', 'Implementación CRM', 'S/ 925.40', 'S/ 166.57', 'S/ 1,091.97', 'Pago 50% adelantado'])
      expect(text).toContain(s);

    confirm.confirm.mockResolvedValueOnce(false);
    await fixture.componentInstance.accept();
    http.expectNone(`${API}/accept`);

    confirm.confirm.mockResolvedValueOnce(true);
    await fixture.componentInstance.accept();
    http.expectOne(`${API}/accept`).flush({ status: 'accepted' });
    http.expectOne(API).flush({ ...Q, status: 'accepted' });
    fixture.detectChanges();
    expect(toast.success).toHaveBeenCalledWith('Cotización aceptada');
    expect(el().textContent).toContain('Aceptaste esta cotización');
    expect(el().textContent).not.toContain('Aceptar cotización');
  });

  it('pagar va a Mercado Pago', async () => {
    await setup();
    const redirect = vi.spyOn(fixture.componentInstance, 'redirect').mockImplementation(() => undefined);
    fixture.componentInstance.pay();
    http.expectOne(`${API}/pay`).flush({ initPoint: 'https://mp/checkout' });
    expect(redirect).toHaveBeenCalledWith('https://mp/checkout');
  });

  it('rechazar envía el motivo; vencida no ofrece botones', async () => {
    await setup();
    const c = fixture.componentInstance;
    c.reason = 'Muy caro ';
    c.reject();
    expect(http.expectOne(`${API}/reject`).request.body).toEqual({ reason: 'Muy caro' });
  });

  it('vencida no ofrece aceptar ni pagar; vuelve con aviso de pago pendiente', async () => {
    await setup({ expired: true }, { pago: 'pendiente' });
    expect(el().textContent).toContain('Esta cotización venció');
    expect(el().textContent).not.toContain('Aceptar cotización');
    expect(fixture.componentInstance.notice()).toContain('en proceso');
  });
});
