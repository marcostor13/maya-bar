import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PlanChangePanelComponent, PlanOptions } from './plan-change-panel';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/billing/plan`;
const BASE: PlanOptions = {
  current: 'crece', paid: true, period: 'monthly', currency: 'PEN', currentPeriodEnd: '2026-12-10T12:00:00Z',
  cancelAtPeriodEnd: false,
  plans: [
    { plan: 'inicia', name: 'Inicia', direction: 'down', price: 99, dueNow: 0, dueNowWithIgv: 0, excess: [{ key: 'users', used: 3, limit: 2 }] },
    { plan: 'escala', name: 'Escala', direction: 'up', price: 549, dueNow: 150, dueNowWithIgv: 177, excess: [] },
  ],
  users: [
    { id: 'u1', name: 'Ana', email: 'ana@x.pe', role: 'TENANT_ADMIN' },
    { id: 'u2', name: 'Beto', email: 'beto@x.pe', role: 'MARKETING' },
    { id: 'u3', name: 'Caro', email: 'caro@x.pe', role: 'MARKETING' },
  ],
};

describe('PlanChangePanelComponent (HU52)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn().mockResolvedValue(true) };

  async function render(opts: Partial<PlanOptions> = {}) {
    await TestBed.configureTestingModule({
      imports: [PlanChangePanelComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(PlanChangePanelComponent);
    f.detectChanges();
    http.expectOne(`${API}/options`).flush({ ...BASE, ...opts });
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }
  const button = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll('button')].find(b => b.textContent?.includes(text)) as HTMLButtonElement;

  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('subir muestra lo que se paga hoy y pide el pago', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('Hoy pagas S/ 177.00');
    button(el, 'Subir a Escala').click();
    await Promise.resolve();
    expect(confirm.confirm).toHaveBeenCalled();
    const req = http.expectOne(`${API}/upgrade`);
    expect(req.request.body).toEqual({ plan: 'escala' });
    req.flush({ applied: true });
    http.expectOne(`${API}/options`).flush(BASE);
    expect(toast.success).toHaveBeenCalled();
  });

  it('bajar con usuarios de más obliga a elegir exactamente el límite', async () => {
    const { f, el } = await render();
    button(el, 'Bajar a Inicia').click();
    f.detectChanges();
    const program = button(el, 'Programar cambio');
    expect(program.disabled).toBe(true);
    const boxes = el.querySelectorAll<HTMLInputElement>('.users input');
    boxes[0].click(); boxes[1].click();
    f.detectChanges();
    expect(boxes[2].disabled).toBe(true);
    expect(program.disabled).toBe(false);
    program.click();
    const req = http.expectOne(`${API}/downgrade`);
    expect(req.request.body).toEqual({ plan: 'inicia', keepUserIds: ['u1', 'u2'] });
    req.flush({});
    http.expectOne(`${API}/options`).flush(BASE);
  });

  it('cancelar envía el motivo; cancelado muestra "Reactivar"', async () => {
    const { f, el } = await render();
    button(el, 'Cancelar mi plan').click();
    f.detectChanges();
    f.componentInstance.reason = 'Muy caro';
    button(el, 'Cancelar plan').click();
    const req = http.expectOne(`${API}/cancel`);
    expect(req.request.body).toEqual({ reason: 'Muy caro' });
    req.flush({});
    http.expectOne(`${API}/options`).flush({ ...BASE, cancelAtPeriodEnd: true });
    f.detectChanges();
    expect(el.textContent).toContain('Cancelaste tu plan');
    button(el, 'Reactivar mi plan').click();
    http.expectOne(`${API}/reactivate`).flush({});
    http.expectOne(`${API}/options`).flush(BASE);
  });

  it('un error muestra toast con el mensaje del servidor', async () => {
    const { el } = await render();
    button(el, 'Subir a Escala').click();
    await Promise.resolve();
    http.expectOne(`${API}/upgrade`).flush({ message: 'Completa tus datos de facturación antes de cambiar de plan' }, { status: 400, statusText: 'Bad' });
    expect(toast.error).toHaveBeenCalledWith('Completa tus datos de facturación antes de cambiar de plan');
  });
});
