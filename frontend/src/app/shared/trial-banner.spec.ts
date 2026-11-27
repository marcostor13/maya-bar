import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TrialBannerComponent } from './trial-banner';
import { daysLeft } from './billing-status.service';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';

const NOW = new Date('2026-12-01T12:00:00Z');

describe('TrialBannerComponent (HU41 C3)', () => {
  let http: HttpTestingController;

  async function render(status: object) {
    await TestBed.configureTestingModule({
      imports: [TrialBannerComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: () => ({ role: 'TENANT_ADMIN' }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(TrialBannerComponent);
    f.componentRef.setInput('now', () => NOW);
    f.detectChanges();
    http.expectOne(`${environment.apiUrl}/billing/status`).flush(status);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  afterEach(() => http?.verify());

  it('daysLeft redondea hacia arriba y no baja de 0', () => {
    expect(daysLeft('2026-12-15T12:00:00Z', NOW)).toBe(14);
    expect(daysLeft('2026-12-02T00:00:00Z', NOW)).toBe(1);
    expect(daysLeft('2026-11-30T00:00:00Z', NOW)).toBe(0);
  });

  it('HU87: una prueba histórica no muestra aviso de prueba gratis', async () => {
    const el = await render({ status: 'trialing', planName: 'Crece', readOnly: false, trialEndsAt: '2026-12-11T12:00:00Z' });
    expect(el.querySelector('.trial')).toBeNull();
    expect(el.textContent).not.toContain('prueba gratis');
  });

  it('HU88 C7: cuenta demo, aviso de solo lectura sin botones de pago', async () => {
    const el = await render({ status: 'legacy', readOnly: false, demo: true });
    expect(el.querySelector('.trial')!.textContent).toContain('cuenta demo');
    expect(el.textContent).not.toContain('Elegir plan');
    expect(el.textContent).not.toContain('Exportar');
    expect(el.querySelector('a.btn, button.btn')).toBeNull();
  });

  it('vencida: solo lectura con "Elegir plan"', async () => {
    const el = await render({ status: 'expired', readOnly: true, reason: 'Tu prueba terminó, elige un plan' });
    expect(el.querySelector('.trial.locked')!.textContent).toContain('Tu prueba terminó');
    expect(el.textContent).toContain('Elegir plan');
  });

  it('cobro fallido (HU51): aviso rojo con "Actualizar medio de pago" al mismo plan', async () => {
    const el = await render({
      status: 'past_due', plan: 'crece', readOnly: false,
      subscription: { period: 'monthly', currency: 'PEN', cancelAtPeriodEnd: false, graceEndsAt: '2026-12-08T12:00:00Z' },
    });
    expect(el.querySelector('.trial.locked')!.textContent).toContain('No pudimos cobrar tu plan');
    expect(el.textContent).toContain('8 de diciembre');
    const a = el.querySelector('a.btn-danger') as HTMLAnchorElement;
    expect(a.textContent).toContain('Actualizar medio de pago');
    expect(a.getAttribute('href')).toBe('/checkout?plan=crece&periodo=mensual&moneda=PEN');
  });

  it('gracia vencida: solo lectura y "Actualizar medio de pago"', async () => {
    const el = await render({
      status: 'expired', plan: 'crece', readOnly: true, reason: 'Tu plan no está activo',
      subscription: { period: 'monthly', cancelAtPeriodEnd: false, graceEndsAt: '2026-11-20T12:00:00Z' },
    });
    expect(el.textContent).toContain('exportarlos');
    expect(el.textContent).toContain('Actualizar medio de pago');
    expect(el.querySelector('.trial')!.getAttribute('role')).toBe('alert');
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Exportar conversaciones')) as HTMLButtonElement).click();
    http.expectOne(`${environment.apiUrl}/conversations/export.csv`).flush(new Blob(['a']));
  });

  it('plan activo: sin aviso', async () => {
    const el = await render({ status: 'active', readOnly: false });
    expect(el.querySelector('.trial')).toBeNull();
  });
});
