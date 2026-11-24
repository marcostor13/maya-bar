import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { PlanLimitDialogComponent, PlanLimitService, planLimitInterceptor } from './plan-limit';
import { AuthService } from '../auth/auth.service';

const role = signal('TENANT_ADMIN');

describe('Diálogo de límite del plan (HU42 C1)', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [PlanLimitDialogComponent],
      providers: [
        { provide: AuthService, useValue: { currentUser: () => ({ role: role() }) } },
        provideRouter([]),
        provideHttpClient(withInterceptors([planLimitInterceptor])),
        provideHttpClientTesting(),
      ],
    }),
  );

  it('un 402 PLAN_LIMIT abre el diálogo con "Mejorar plan" y "Comprar add-on"', () => {
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(PlanLimitDialogComponent);
    let failed = false;
    http.post('/api/users', {}).subscribe({ error: () => (failed = true) });
    ctrl.expectOne('/api/users').flush(
      { code: 'PLAN_LIMIT', resource: 'users', message: 'Tu plan incluye hasta 2 usuarios.' },
      { status: 402, statusText: 'Payment Required' },
    );
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(failed).toBe(true);
    expect(el.querySelector('[role="dialog"]')!.textContent).toContain('Llegaste al límite de tu plan');
    expect(el.textContent).toContain('Tu plan incluye hasta 2 usuarios.');
    const labels = [...el.querySelectorAll('button')].map(b => b.textContent!.trim());
    expect(labels).toContain('Mejorar plan');
    expect(labels).toContain('Comprar add-on');
  });

  it('PLAN_FEATURE no ofrece add-on; otros 402 y errores no abren el diálogo', () => {
    const svc = TestBed.inject(PlanLimitService);
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    http.get('/api/x').subscribe({ error: () => undefined });
    ctrl.expectOne('/api/x').flush({ message: 'otro' }, { status: 402, statusText: 'x' });
    expect(svc.state()).toBeNull();
    http.get('/api/y').subscribe({ error: () => undefined });
    ctrl.expectOne('/api/y').flush({ message: 'no' }, { status: 400, statusText: 'x' });
    expect(svc.state()).toBeNull();

    svc.open({ code: 'PLAN_FEATURE', message: 'No incluida' });
    const f = TestBed.createComponent(PlanLimitDialogComponent);
    f.detectChanges();
    const labels = [...(f.nativeElement as HTMLElement).querySelectorAll('button')].map(b => b.textContent!.trim());
    expect(labels).not.toContain('Comprar add-on');
  });

  it('HU44 C3: quien no es administrador ve "Pídele al administrador" y no los botones', () => {
    role.set('MARKETING');
    const f = TestBed.createComponent(PlanLimitDialogComponent);
    TestBed.inject(PlanLimitService).open({ code: 'PLAN_LIMIT', message: 'Límite' });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Pídele al administrador');
    expect([...el.querySelectorAll('button')].map(b => b.textContent!.trim())).not.toContain('Mejorar plan');
    role.set('TENANT_ADMIN');
  });

  it('HU53: "Comprar add-on" compra en un paso el extra del recurso; sin add-on para el recurso no aparece', () => {
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(PlanLimitDialogComponent);
    http.post('/api/agents', {}).subscribe({ error: () => undefined });
    ctrl.expectOne('/api/agents').flush({ code: 'PLAN_LIMIT', resource: 'aiAgents', message: 'Límite' }, { status: 402, statusText: 'x' });
    f.detectChanges();
    let el = f.nativeElement as HTMLElement;
    expect([...el.querySelectorAll('button')].map(b => b.textContent!.trim())).not.toContain('Comprar add-on');
    TestBed.inject(PlanLimitService).close();

    http.post('/api/users', {}).subscribe({ error: () => undefined });
    ctrl.expectOne('/api/users').flush({ code: 'PLAN_LIMIT', resource: 'users', message: 'Límite' }, { status: 402, statusText: 'x' });
    f.detectChanges();
    el = f.nativeElement as HTMLElement;
    const buy = [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Comprar add-on')!;
    buy.click();
    const req = ctrl.expectOne(r => r.url.endsWith('/billing/addons/buy'));
    expect(req.request.body).toEqual({ addon: 'extra_user' });
    req.flush({ applied: true });
    f.detectChanges();
    expect(TestBed.inject(PlanLimitService).state()).toBeNull();
  });
});
