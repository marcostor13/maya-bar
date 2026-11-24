import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MyPlanComponent, usagePercent } from './my-plan';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/billing`;

describe('MyPlanComponent (HU44)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };

  async function render(info: object | null = null) {
    await TestBed.configureTestingModule({
      imports: [MyPlanComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(MyPlanComponent);
    f.detectChanges();
    http.expectOne(`${API}/status`).flush({
      plan: 'inicia', planName: 'Inicia', legacy: false, status: 'active', readOnly: false,
      subscription: { period: 'monthly', currency: 'PEN', amount: 116.82, currentPeriodEnd: '2026-12-23T00:00:00Z', cancelAtPeriodEnd: false },
    });
    http.expectOne(`${API}/usage`).flush({
      unlimited: false,
      resources: [
        { key: 'users', limit: 2, used: 2 },
        { key: 'contacts', limit: 2000, used: 500 },
      ],
      credits: { period: '2026-11', unlimited: false, included: 500, usedFromPlan: 125, purchased: 0, remaining: 375 },
    });
    http.expectOne(`${API}/payments`).flush([
      { _id: 'p1', concept: 'Plan Inicia mensual', amount: 116.82, currency: 'PEN', status: 'approved',
        paidAt: '2026-11-23T00:00:00Z', receipt: { pdfUrl: 'https://x/b001-1.pdf', xmlUrl: 'https://x/b001-1.xml' } },
    ]);
    http.expectOne(`${API}/info`).flush(info);
    f.detectChanges();
    // Panel de cambio de plan (HU52) del plan activo.
    http.match(`${API}/plan/options`).forEach(r => r.flush({ current: 'inicia', paid: true, cancelAtPeriodEnd: false, plans: [], users: [] }));
    http.match(`${API}/addons`).forEach(r => r.flush({ currency: 'PEN', paid: true, aiCreditsPurchased: 0, campaignEmailsPurchased: 0, addons: [] }));
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }

  afterEach(() => http?.verify());

  it('usagePercent acota a 0–100 y sin límite es 0', () => {
    expect(usagePercent(1, 2)).toBe(50);
    expect(usagePercent(5, 2)).toBe(100);
    expect(usagePercent(5, null)).toBe(0);
  });

  it('C1: muestra el uso real y el límite de cada recurso y los créditos', async () => {
    const { el } = await render();
    expect(el.querySelector('[data-key="users"]')!.textContent).toContain('2 / 2');
    expect(el.querySelector('[data-key="contacts"]')!.textContent).toContain('500 / 2,000');
    expect(el.querySelector('[data-key="users"] .bar-fill')!.classList).toContain('bar-full');
    expect(el.querySelector('[data-key="aiCredits"]')!.textContent).toContain('375 disponibles');
    expect(el.textContent).toContain('Próximo cobro');
  });

  it('C2: lista los pagos con enlaces al comprobante', async () => {
    const { el } = await render();
    const links = [...el.querySelectorAll('.payment a')].map(a => a.getAttribute('href'));
    expect(el.querySelector('.payment')!.textContent).toContain('Plan Inicia mensual');
    expect(links).toEqual(['https://x/b001-1.pdf', 'https://x/b001-1.xml']);
  });

  it('precarga los datos de facturación guardados (sin Zone.js)', async () => {
    const { el } = await render({ docType: 'factura', docNumber: '20123456789', legalName: 'Acme SAC', address: 'Av. Lima 1' });
    await new Promise(r => setTimeout(r));
    const values = [...el.querySelectorAll('form input')].map(i => (i as HTMLInputElement).value);
    expect(values).toContain('20123456789');
    expect(values).toContain('Av. Lima 1');
  });

  it('guardar datos de facturación muestra el error del servidor con toast', async () => {
    const { f } = await render();
    const c = f.componentInstance;
    c.info = { docType: 'factura', docNumber: '12345678', legalName: 'Acme', address: 'Lima' };
    c.saveInfo();
    http.expectOne(`${API}/info`).flush(
      { message: 'Para factura escribe un RUC válido de 11 dígitos' },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(c.formError()).toContain('RUC');
    expect(toast.error).toHaveBeenCalled();
  });
});
