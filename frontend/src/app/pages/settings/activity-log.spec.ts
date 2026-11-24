import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ActivityLogComponent, actionLabel } from './activity-log';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/audit`;

describe('Registro de actividad (HU63)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };

  async function setup() {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ToastService, useValue: toast }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(ActivityLogComponent);
    f.detectChanges();
    http.expectOne(`${BASE}/actions`).flush(['auth.login', 'customers.export']);
    return f;
  }
  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('lista la actividad con etiquetas legibles y filtra por usuario, acción y fechas', async () => {
    const f = await setup();
    http.expectOne((r) => r.url === BASE && r.params.get('page') === '1').flush({
      items: [
        { _id: 'a1', action: 'customers.export', actorEmail: 'ana@x.pe', success: true, resource: 'customer', details: { rows: 120 }, ip: '1.2.3.4', createdAt: '2026-11-24T10:00:00Z' },
        { _id: 'a2', action: 'auth.login_failed', actorEmail: 'beto@x.pe', success: false, details: { reason: 'bad_credentials' }, createdAt: '2026-11-24T09:00:00Z' },
      ],
      total: 2, page: 1, limit: 50,
    });
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Exportó contactos');
    expect(text).toContain('rows: 120');
    expect(text).toContain('Inicio de sesión fallido');
    expect((f.nativeElement as HTMLElement).querySelector('.badge-danger')).toBeTruthy();

    const c = f.componentInstance;
    c.email = 'ana';
    c.action = 'customers.export';
    c.from = '2026-11-01';
    c.to = '2026-11-24';
    c.search();
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('email')).toBe('ana');
    expect(req.request.params.get('action')).toBe('customers.export');
    expect(req.request.params.get('from')).toBe('2026-11-01');
    expect(req.request.params.get('to')).toBe('2026-11-24');
    req.flush({ items: [], total: 0, page: 1, limit: 50 });
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('No hay actividad');
  });

  it('exporta a CSV con los mismos filtros', async () => {
    const f = await setup();
    http.expectOne((r) => r.url === BASE).flush({ items: [], total: 0, page: 1, limit: 50 });
    const c = f.componentInstance;
    c.action = 'auth.login';
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    c.exportCsv();
    const req = http.expectOne((r) => r.url === `${BASE}/export.csv`);
    expect(req.request.params.get('action')).toBe('auth.login');
    req.flush(new Blob(['fecha']));
    expect(toast.success).toHaveBeenCalledWith('Registro exportado');
  });

  it('las acciones del superadmin se rotulan como soporte', () => {
    expect(actionLabel('admin.tenants.updated')).toBe('Soporte de Maya: tenants updated');
  });
});
