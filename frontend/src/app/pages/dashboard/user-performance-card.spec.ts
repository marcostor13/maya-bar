import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UserPerformanceCardComponent, type UserPerformance, type UserPerformanceRow } from './user-performance-card';

const base = { messages: 0, openChats: 0, newLeads: 0, wonDeals: 0, wonValue: 0, lostDeals: 0, newContacts: 0, assignedContacts: 0, idleContacts: 0, activities: 0, calls: 0 };
const ANA: UserPerformanceRow = { ...base, id: 'u1', name: 'Ana', email: 'ana@x.pe', role: 'TENANT_ADMIN', messages: 3, wonValue: 100 };
const LUIS: UserPerformanceRow = { ...base, id: 'u2', name: 'Luis', email: 'luis@x.pe', role: 'MARKETING', messages: 9, wonValue: 900, calls: 2 };
const TEAM: UserPerformance = {
  scope: 'team', channel: null, users: [ANA, LUIS],
  totals: { ...base, messages: 12, wonValue: 1000, calls: 2 },
};

describe('UserPerformanceCardComponent (HU20 C5)', () => {
  let fixture: ComponentFixture<UserPerformanceCardComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const names = () => Array.from(el().querySelectorAll('tbody .name')).map((n) => n.textContent!.trim());
  const header = (label: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('thead button')).find((b) => b.textContent!.trim().startsWith(label))!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserPerformanceCardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(UserPerformanceCardComponent);
    fixture.componentRef.setInput('range', '7d');
    fixture.componentRef.setInput('channel', 'whatsapp');
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  const flush = (body: UserPerformance | null, status = 200) => {
    const req = http.expectOne((r) => r.url.endsWith('/dashboard/users'));
    expect(req.request.params.get('range')).toBe('7d');
    expect(req.request.params.get('channel')).toBe('whatsapp');
    if (status === 200) req.flush(body);
    else req.flush({ message: 'x' }, { status, statusText: 'x' });
    fixture.detectChanges();
  };

  it('pinta una fila por usuario, ordenada por valor ganado, y el total del equipo', () => {
    flush(TEAM);
    expect(el().textContent).toContain('Rendimiento por usuario');
    expect(names()).toEqual(['Luis', 'Ana']);
    expect(el().querySelector('tfoot')!.textContent).toContain('Total del equipo');
    expect(el().querySelector('tfoot')!.textContent).toContain('12');
    expect(el().textContent).toContain('Marketing');
  });

  it('ordena por la columna elegida y lo anuncia con aria-sort', () => {
    flush(TEAM);
    header('Usuario').click();
    fixture.detectChanges();
    expect(names()).toEqual(['Ana', 'Luis']);
    expect(header('Usuario').closest('th')!.getAttribute('aria-sort')).toBe('ascending');
    header('Usuario').click();
    fixture.detectChanges();
    expect(names()).toEqual(['Luis', 'Ana']);
    expect(header('Usuario').closest('th')!.getAttribute('aria-sort')).toBe('descending');
  });

  it('un rol sin supervisión ve «Tu rendimiento» sin totales', () => {
    flush({ ...TEAM, scope: 'self', users: [LUIS] });
    expect(el().textContent).toContain('Tu rendimiento');
    expect(el().querySelector('tfoot')).toBeNull();
  });

  it('resalta los contactos sin seguimiento', () => {
    flush({ ...TEAM, users: [{ ...LUIS, assignedContacts: 5, idleContacts: 3 }] });
    const warn = el().querySelector('td.warn');
    expect(warn?.textContent?.trim()).toBe('3');
    expect(el().textContent).toContain('Sin seguimiento');
  });

  it('un cambio de canal cancela la petición anterior', () => {
    fixture.componentRef.setInput('channel', 'email');
    fixture.detectChanges();
    const reqs = http.match((r) => r.url.endsWith('/dashboard/users'));
    expect(reqs).toHaveLength(2);
    expect(reqs[0].cancelled).toBe(true);
    expect(reqs[1].request.params.get('channel')).toBe('email');
    reqs[1].flush(TEAM);
  });

  it('vacío y error con reintento', () => {
    flush({ ...TEAM, users: [] });
    expect(el().textContent).toContain('No hay usuarios activos');
    fixture.componentInstance.load();
    flush(null, 500);
    expect(el().querySelector('[role="alert"]')).toBeTruthy();
    (el().querySelector('[role="alert"] button') as HTMLButtonElement).click();
    flush(TEAM);
    expect(names()).toHaveLength(2);
  });
});
