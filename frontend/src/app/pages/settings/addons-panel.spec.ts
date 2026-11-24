import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AddonsPanelComponent, AddonsInfo } from './addons-panel';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/billing/addons`;
const INFO: AddonsInfo = {
  currency: 'PEN', paid: false, aiCreditsPurchased: 1000, aiCreditsPurchasedExpiresAt: '2027-11-24T12:00:00Z',
  campaignEmailsPurchased: 0,
  addons: [
    { id: 'extra_user', name: 'Usuario adicional', kind: 'monthly', price: 39, owned: 0, available: false, dueNow: null, dueNowWithIgv: null },
    { id: 'credits_1000', name: '1.000 créditos de IA', kind: 'topup', price: 49, owned: 0, available: true, dueNow: 49, dueNowWithIgv: 57.82 },
  ],
};

describe('AddonsPanelComponent (HU53)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn().mockResolvedValue(true) };

  async function render() {
    await TestBed.configureTestingModule({
      imports: [AddonsPanelComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(AddonsPanelComponent);
    f.detectChanges();
    http.expectOne(API).flush(INFO);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }

  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('lista extras y recargas con precio y saldo comprado; sin plan pagado los mensuales no se compran', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('Créditos de IA comprados');
    const user = el.querySelector('[data-addon="extra_user"]')!;
    expect(user.textContent).toContain('requiere un plan pagado');
    expect((user.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('[data-addon="credits_1000"]')!.textContent).toContain('S/ 49.00');
  });

  it('comprar una recarga confirma con el total con IGV y abre el pago', async () => {
    const { el } = await render();
    (el.querySelector('[data-addon="credits_1000"] button') as HTMLButtonElement).click();
    await Promise.resolve(); await Promise.resolve();
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('S/ 57.82') }));
    const req = http.expectOne(`${API}/buy`);
    expect(req.request.body).toEqual({ addon: 'credits_1000' });
    req.flush({ message: 'Completa tus datos de facturación antes de comprar' }, { status: 400, statusText: 'Bad' });
    expect(toast.error).toHaveBeenCalledWith('Completa tus datos de facturación antes de comprar');
  });
});
