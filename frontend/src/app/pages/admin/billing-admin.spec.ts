import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminBillingComponent } from './billing-admin';
import { SubscriptionDetailComponent, type SubscriptionDetail } from './subscription-detail';
import { CouponsAdminComponent } from './coupons-admin';
import { BillingQueuesComponent } from './billing-queues';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/billing/admin`;
const SUMMARY = {
  mrr: { PEN: 943.17, USD: 0 }, byPlan: [{ plan: 'crece', planName: 'Crece', count: 2, mrr: { PEN: 485.67, USD: 0 } }],
  active: 4, newThisMonth: 1, canceledThisMonth: 1, cancelScheduled: 2, churnPct: 20,
  pastDue: 2, revenueThisMonth: { PEN: 1200, USD: 0 },
};
const DETAIL: SubscriptionDetail = {
  tenant: { _id: 't1', name: 'Pastelería Ana', email: 'ana@x.pe', plan: 'crece', subscription: { status: 'active', period: 'monthly', currency: 'PEN', amount: 249 } },
  payments: [{ _id: 'p1', concept: 'Plan Crece', amount: 293.82, currency: 'PEN', status: 'approved', provider: 'mercadopago', paidAt: '2026-11-01T00:00:00Z', receipt: { status: 'issued', code: 'B001-1', pdfUrl: 'https://x/a.pdf' } }],
  onboarding: [],
  actions: [{ _id: 'a1', action: 'change_plan', actorEmail: 'admin@maya.pe', createdAt: '2026-11-02T00:00:00Z' }],
};

describe('Panel de suscripciones (HU57)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn().mockResolvedValue(true) };

  async function setup() {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast }, { provide: ConfirmService, useValue: confirm }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  }
  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('muestra el resumen con MRR, churn e ingresos (sin KPI de pruebas, HU87) por plan', async () => {
    await setup();
    const f = TestBed.createComponent(AdminBillingComponent);
    f.detectChanges();
    http.expectOne(`${API}/subscriptions/summary`).flush(SUMMARY);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="mrr"]')!.textContent).toContain('943.17');
    expect(el.textContent).toContain('Churn 20 %');
    expect(el.textContent).not.toContain('Pruebas activas');
    expect(el.textContent).toContain('Crece');
  });

  it('pago pendiente lleva a la lista filtrada y abrir una cuenta muestra su ficha', async () => {
    await setup();
    const f = TestBed.createComponent(AdminBillingComponent);
    f.detectChanges();
    http.expectOne(`${API}/subscriptions/summary`).flush(SUMMARY);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    (el.querySelector('.kpi-link') as HTMLButtonElement).click();
    const req = http.expectOne(r => r.url === `${API}/subscriptions` && r.params.get('status') === 'past_due');
    req.flush({ total: 1, page: 1, rows: [{ _id: 't1', name: 'Pastelería Ana', email: 'ana@x.pe', plan: 'crece', status: 'past_due', period: 'monthly', currency: 'PEN', amount: 249 }] });
    f.detectChanges();
    expect(el.textContent).toContain('Pago pendiente');
    (el.querySelector('[data-open="t1"]') as HTMLButtonElement).click();
    f.detectChanges();
    http.expectOne(`${API}/subscriptions/t1`).flush(DETAIL);
    f.detectChanges();
    expect(el.textContent).toContain('Cambió el plan o el precio');
    expect(el.querySelector('[data-testid="amount"]')!.textContent).toContain('249.00');
  });

  it('C2/C3 en pantalla: registra un pago manual y reembolsa con confirmación', async () => {
    await setup();
    const f = TestBed.createComponent(SubscriptionDetailComponent);
    f.componentRef.setInput('tenantId', 't1');
    f.detectChanges();
    http.expectOne(`${API}/subscriptions/t1`).flush(DETAIL);
    f.detectChanges();
    const c = f.componentInstance;
    c.openPayment();
    c.pay.total = 837.8;
    c.pay.period = 'quarterly';
    await c.manualPayment();
    const pay = http.expectOne(`${API}/subscriptions/t1/manual-payment`);
    expect(pay.request.body).toMatchObject({ plan: 'crece', period: 'quarterly', currency: 'PEN', total: 837.8, method: 'transfer' });
    expect(pay.request.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    pay.flush({ paymentId: 'p2' });
    http.expectOne(`${API}/subscriptions/t1`).flush(DETAIL);
    expect(toast.success).toHaveBeenCalled();
    expect(c.paymentOpen()).toBe(false);

    f.detectChanges();
    ((f.nativeElement as HTMLElement).querySelector('[data-refund="p1"]') as HTMLButtonElement).click();
    f.detectChanges();
    c.refund();
    expect(toast.error).toHaveBeenCalledWith('Indica el motivo del reembolso');
    c.refundReason = 'Cobro duplicado';
    c.refund();
    const rf = http.expectOne(`${API}/subscriptions/payments/p1/refund`);
    expect(rf.request.body).toEqual({ reason: 'Cobro duplicado' });
    rf.flush({ status: 'refunded' });
    http.expectOne(`${API}/subscriptions/t1`).flush(DETAIL);
  });

  it('un error de la API se muestra con toast', async () => {
    await setup();
    const f = TestBed.createComponent(SubscriptionDetailComponent);
    f.componentRef.setInput('tenantId', 't1');
    f.detectChanges();
    http.expectOne(`${API}/subscriptions/t1`).flush(DETAIL);
    f.componentInstance.resendAccess();
    http.expectOne(`${API}/subscriptions/t1/resend-access`).flush({ message: 'La cuenta ya tiene acceso' }, { status: 400, statusText: 'Bad Request' });
    expect(toast.error).toHaveBeenCalledWith('La cuenta ya tiene acceso');
  });

  it('crea un cupón y lo pausa', async () => {
    await setup();
    const f = TestBed.createComponent(CouponsAdminComponent);
    f.detectChanges();
    http.expectOne(`${API}/coupons`).flush([]);
    const c = f.componentInstance;
    c.openNew();
    c.form()!.code = 'lanza';
    c.form()!.value = 20;
    c.form()!.plans.push('crece');
    c.save();
    const req = http.expectOne(r => r.method === 'POST' && r.url === `${API}/coupons`);
    expect(req.request.body).toMatchObject({ code: 'LANZA', type: 'percent', value: 20, plans: ['crece'], duration: 'once' });
    req.flush({});
    http.expectOne(`${API}/coupons`).flush([{ _id: 'c1', code: 'LANZA', type: 'percent', value: 20, plans: ['crece'], periods: [], duration: 'once', used: 0, active: true }]);
    f.detectChanges();
    const btn = [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find(b => b.textContent!.trim() === 'Pausar')!;
    btn.click();
    const p = http.expectOne(`${API}/coupons/c1`);
    expect(p.request.body).toEqual({ active: false });
    p.flush({});
    http.expectOne(`${API}/coupons`).flush([]);
  });

  it('reintenta un comprobante con error', async () => {
    await setup();
    const f = TestBed.createComponent(BillingQueuesComponent);
    f.detectChanges();
    http.expectOne(r => r.url === `${API}/receipts` && r.params.get('status') === 'manual').flush([]);
    f.componentInstance.setStatus('failed');
    http.expectOne(r => r.url === `${API}/receipts` && r.params.get('status') === 'failed')
      .flush([{ _id: 'p9', concept: 'Plan Inicia', amount: 116.82, currency: 'PEN', paidAt: '2026-11-01', receipt: { status: 'failed', error: 'RUC no válido' } }]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('RUC no válido');
    (el.querySelector('[data-receipt="p9"] button') as HTMLButtonElement).click();
    http.expectOne(`${API}/receipts/p9/retry`).flush({ ok: true });
    http.expectOne(r => r.url === `${API}/receipts`).flush([]);
    expect(toast.success).toHaveBeenCalled();
  });

  it('marca como facturado un pago por facturar a mano (HU75)', async () => {
    await setup();
    const f = TestBed.createComponent(BillingQueuesComponent);
    f.detectChanges();
    http.expectOne(r => r.url === `${API}/receipts` && r.params.get('status') === 'manual')
      .flush([{ _id: 'p7', concept: 'Plan Crece (mensual)', amount: 293.82, currency: 'PEN', paidAt: '2026-11-24', receipt: { status: 'manual' } }]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Por facturar');
    f.componentInstance.refs['p7'] = ' B001-15 ';
    const btn = [...el.querySelectorAll<HTMLButtonElement>('[data-receipt="p7"] button')].find(b => b.textContent!.includes('Marcar facturado'))!;
    btn.click();
    const req = http.expectOne(`${API}/receipts/p7/invoiced`);
    expect(req.request.body).toEqual({ reference: 'B001-15' });
    req.flush({ ok: true });
    http.expectOne(r => r.url === `${API}/receipts`).flush([]);
    expect(toast.success).toHaveBeenCalledWith('Pago marcado como facturado');
  });
});
