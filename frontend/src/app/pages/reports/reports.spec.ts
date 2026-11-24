import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ReportsComponent } from './reports';
import { PinnedReportsCardComponent } from './pinned-reports-card';
import { ReportViewComponent } from './report-view';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/reports`;
const ALLOWED = {
  leads: { metrics: ['count', 'sum_value', 'conversion_rate', 'avg_days_to_close'], groups: ['owner', 'stage', 'month', 'none'], dates: ['createdAt', 'closedAt'] },
  customers: { metrics: ['count'], groups: ['owner', 'source', 'none'], dates: ['createdAt'] },
  conversations: { metrics: ['count'], groups: ['channel', 'none'], dates: ['createdAt'] },
  campaigns: { metrics: ['count'], groups: ['type', 'none'], dates: ['createdAt'] },
  registrations: { metrics: ['count'], groups: ['event', 'none'], dates: ['createdAt'] },
};
const RESULT = {
  rows: [{ key: 'u1', label: 'Ana', value: 3, count: 3 }, { key: 'u2', label: 'Beto', value: 1, count: 1 }],
  total: 4, from: '2026-11-01T05:00:00Z', to: '2026-11-24T20:00:00Z', metric: 'count', groupBy: 'owner',
};
const SAVED = {
  _id: 'r1', name: 'Ganadas por vendedor', source: 'leads', metric: 'count', groupBy: 'owner', filters: { status: 'won', dateField: 'closedAt', range: 'this_month' },
  chart: 'bar', pinned: true, sharedRoles: ['MARKETING'], createdBy: 'me', schedule: null,
};

describe('Reportes configurables (HU64)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };

  async function configure(role = 'TENANT_ADMIN') {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast }, { provide: ConfirmService, useValue: confirm },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'me', email: 'a@x.pe', role }) } }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  }
  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('lista los guardados con su resultado y crea uno nuevo con vista previa', async () => {
    await configure();
    const f = TestBed.createComponent(ReportsComponent);
    f.detectChanges();
    http.expectOne(`${BASE}/meta`).flush({ allowed: ALLOWED, maxRangeDays: 366 });
    http.expectOne(BASE).flush([SAVED]);
    http.expectOne(`${BASE}/r1/run`).flush({ report: SAVED, result: RESULT });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Ganadas por vendedor');
    expect(el.textContent).toContain('En el dashboard');
    expect(el.querySelectorAll('.bar-row').length).toBe(2);

    const c = f.componentInstance;
    c.openNew();
    http.expectOne(`${environment.apiUrl}/roles`).flush([{ key: 'TENANT_ADMIN', label: 'Admin' }, { key: 'MARKETING', label: 'Marketing' }]);
    const e = c.editing()!;
    e.name = 'Ganadas por vendedor del mes';
    e.filters.status = 'won';
    e.filters.dateField = 'closedAt';
    c.toggleRole('MARKETING');
    e.pinned = true;
    expect(c.roles().map((r) => r.key)).toEqual(['MARKETING']);

    c.preview();
    const pv = http.expectOne(`${BASE}/run`);
    expect(pv.request.body).toEqual({ source: 'leads', metric: 'count', groupBy: 'owner', filters: { dateField: 'closedAt', range: 'this_month', status: 'won' } });
    pv.flush(RESULT);

    c.save();
    const post = http.expectOne((r) => r.url === BASE && r.method === 'POST');
    expect(post.request.body).toMatchObject({ name: 'Ganadas por vendedor del mes', pinned: true, sharedRoles: ['MARKETING'], schedule: null });
    post.flush({ ...SAVED, _id: 'r2' });
    expect(toast.success).toHaveBeenCalledWith('Reporte guardado');
    http.expectOne(BASE).flush([]);
  });

  it('cambiar la fuente ajusta métrica y agrupación a las permitidas; el envío por correo exige correos', async () => {
    await configure('MANAGER');
    const f = TestBed.createComponent(ReportsComponent);
    f.detectChanges();
    http.expectOne(`${BASE}/meta`).flush({ allowed: ALLOWED, maxRangeDays: 366 });
    http.expectOne(BASE).flush([]);
    const c = f.componentInstance;
    c.openNew();
    http.expectOne(`${environment.apiUrl}/roles`).flush([]);
    const e = c.editing()!;
    e.metric = 'sum_value';
    e.groupBy = 'stage';
    e.source = 'conversations';
    c.onSource();
    expect(e.metric).toBe('count');
    expect(e.groupBy).toBe('channel');
    e.name = 'Chats por canal';
    e.scheduled = true;
    e.emails = 'gerencia@x.pe; ventas@x.pe';
    c.save();
    const post = http.expectOne((r) => r.url === BASE && r.method === 'POST');
    expect(post.request.body.schedule).toEqual({ frequency: 'weekly', emails: ['gerencia@x.pe', 'ventas@x.pe'] });
    post.flush({ message: 'x' }, { status: 400, statusText: 'Bad' });
    expect(toast.error).toHaveBeenCalled();
  });

  it('un rol compartido ve los reportes pero no los edita', async () => {
    await configure('MARKETING');
    const f = TestBed.createComponent(ReportsComponent);
    f.detectChanges();
    http.expectOne(`${BASE}/meta`).flush({ allowed: ALLOWED, maxRangeDays: 366 });
    http.expectOne(BASE).flush([{ ...SAVED, createdBy: 'otro' }]);
    http.expectOne(`${BASE}/r1/run`).flush({ report: SAVED, result: RESULT });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Nuevo reporte');
    expect(el.querySelector('[aria-label="Editar reporte"]')).toBeNull();
    expect(el.querySelector('[aria-label="Exportar CSV"]')).toBeTruthy();
  });

  it('el dashboard muestra los fijados y nada si no hay', async () => {
    await configure('MARKETING');
    const f = TestBed.createComponent(PinnedReportsCardComponent);
    f.detectChanges();
    http.expectOne(`${BASE}/pinned`).flush([{ report: { _id: 'r1', name: 'Ganadas por vendedor', chart: 'table' }, result: RESULT }]);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Ganadas por vendedor');
    expect((f.nativeElement as HTMLElement).textContent).toContain('Total: 4');

    const g = TestBed.createComponent(PinnedReportsCardComponent);
    g.detectChanges();
    http.expectOne(`${BASE}/pinned`).flush([]);
    g.detectChanges();
    expect((g.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });

  it('la línea y los sufijos de métrica', async () => {
    await configure();
    const f = TestBed.createComponent(ReportViewComponent);
    f.componentRef.setInput('result', { ...RESULT, metric: 'conversion_rate', total: 57.5 });
    f.componentRef.setInput('chart', 'line');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('polyline')?.getAttribute('points')).toBe('0.0,5.0 300.0,78.3');
    expect((f.nativeElement as HTMLElement).textContent).toContain('57.5%');
  });
});
