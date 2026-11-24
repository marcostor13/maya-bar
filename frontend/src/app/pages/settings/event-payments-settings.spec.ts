import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EventPaymentsSettingsComponent } from './event-payments-settings';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/event-tickets/mp`;

describe('Cobro de entradas en Configuración (HU67)', () => {
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };
  let http: HttpTestingController;

  async function setup(status: Record<string, unknown>) {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [EventPaymentsSettingsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }, { provide: ConfirmService, useValue: confirm }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(EventPaymentsSettingsComponent);
    f.detectChanges();
    http.expectOne(`${API}/status`).flush({ available: true, connected: false, mpUserId: null, liveMode: false, connectedAt: null, feePct: 3, ...status });
    f.detectChanges();
    return f;
  }
  afterEach(() => http.verify());

  it('sin conectar ofrece conectar y pide la URL de autorización', async () => {
    const f = await setup({});
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('comisión de 3 %');
    const btn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes('Conectar Mercado Pago'))!;
    expect(btn.disabled).toBe(false);
    btn.click();
    const req = http.expectOne(`${API}/connect`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'Falta MP_CLIENT_ID' }, { status: 400, statusText: 'Bad' });
    expect(toast.error).toHaveBeenCalledWith('Falta MP_CLIENT_ID');
  });

  it('conectada muestra la cuenta y desconecta solo tras confirmar', async () => {
    const f = await setup({ connected: true, mpUserId: '777', liveMode: true });
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Cuenta 777');
    expect(el.textContent).toContain('Producción');
    confirm.confirm.mockResolvedValueOnce(true);
    await f.componentInstance.disconnect();
    http.expectOne((r) => r.url === API && r.method === 'DELETE').flush({ connected: false });
    http.expectOne(`${API}/status`).flush({ available: true, connected: false, feePct: 3 });
    expect(toast.success).toHaveBeenCalledWith('Mercado Pago desconectado');
  });

  it('sin la app de Maya configurada no deja conectar', async () => {
    const f = await setup({ available: false });
    const btn = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent!.includes('Conectar'))!;
    expect(btn.disabled).toBe(true);
  });
});
