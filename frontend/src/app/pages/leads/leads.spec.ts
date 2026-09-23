import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { LeadsComponent } from './leads';
import { LeadAssignComponent } from './lead-assign';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const ME = 'u-me';
const PEDRO = { _id: 'u-pedro', name: 'Pedro Ruiz', email: 'p@x.pe' };
const lead = (id: string, ownerId?: unknown) => ({
  _id: id, customerId: { _id: 'c', name: 'Ana' }, title: `Lead ${id}`, stage: 'new', status: 'open',
  value: 100, currency: 'PEN', priority: 'medium', ownerId, source: 'manual', tags: [], lastActivityAt: '2026-09-20',
});
const board = (leads: unknown[]) => [{ stage: 'new', label: 'Nuevo', color: '#000', count: leads.length, value: 0, leads }];

describe('LeadsComponent — reparto', () => {
  let fixture: ComponentFixture<LeadsComponent>;
  let http: HttpTestingController;
  let role = 'MARKETING';
  const toast = { success: vi.fn(), error: vi.fn() };
  const el = () => fixture.nativeElement as HTMLElement;

  async function setup(leads: unknown[]) {
    await TestBed.configureTestingModule({
      imports: [LeadsComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal({ id: ME, email: 'me@x.pe', role }) } },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: { confirm: vi.fn().mockResolvedValue(true) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LeadsComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/leads/stages')).flush([{ key: 'new', label: 'Nuevo', order: 1, color: '#000', probability: 10 }]);
    http.expectOne((r) => r.url.endsWith('/leads/owners')).flush([
      { _id: ME, name: 'Yo Mismo', email: 'me@x.pe', role, openLeads: 1 }, { ...PEDRO, role: 'MARKETING', openLeads: 4 },
    ]);
    http.expectOne((r) => r.url.includes('/leads/board')).flush(board(leads));
    http.expectOne((r) => r.url.endsWith('/leads/stats')).flush({ open: 3, unassigned: 1, mine: 1, overdueTasks: 0, dueTodayTasks: 0 });
    fixture.detectChanges();
  }

  beforeEach(() => { vi.clearAllMocks(); role = 'MARKETING'; });
  afterEach(() => http.verify());

  it('las de la bolsa muestran "Tomar" y tomarla llama a claim', async () => {
    await setup([lead('a'), lead('b', { _id: ME, name: 'Yo Mismo', email: 'me@x.pe' })]);
    const take = el().querySelectorAll('.take-btn');
    expect(take).toHaveLength(1);
    expect(el().textContent).toContain('Sin asignar · 1 mías');
    (take[0] as HTMLButtonElement).click();
    const req = http.expectOne((r) => r.url.endsWith('/leads/a/claim'));
    expect(req.request.method).toBe('PATCH');
    req.flush(lead('a', { _id: ME, name: 'Yo Mismo', email: 'me@x.pe' }));
    expect(toast.success).toHaveBeenCalled();
    http.match(() => true).forEach((r) => r.flush([]));
  });

  it('una oportunidad ajena queda bloqueada: sin editar, sin mover, con aviso', async () => {
    await setup([lead('p', PEDRO)]);
    const c = fixture.componentInstance;
    const card = el().querySelector('.lead-card') as HTMLElement;
    expect(card.getAttribute('draggable')).toBe('false');
    c.openDetail(c.columns()[0].leads[0]);
    http.expectOne((r) => r.url.endsWith('/activities')).flush([]);
    fixture.detectChanges();
    expect(el().textContent).toContain('La lleva Pedro Ruiz');
    expect(el().textContent).not.toContain('Editar');
    expect(el().querySelector('.activity-form')).toBeNull();
    expect((el().querySelector('.stage-chip') as HTMLButtonElement).disabled).toBe(true);
  });

  it('quien supervisa puede trabajar y derivar una ajena', async () => {
    role = 'MANAGER';
    await setup([lead('p', PEDRO)]);
    const c = fixture.componentInstance;
    c.openDetail(c.columns()[0].leads[0]);
    http.expectOne((r) => r.url.endsWith('/activities')).flush([]);
    expect(c.canWork(c.detail()!)).toBe(true);
    c.assignMode.set('transfer');
    c.doAssign({ toUserId: ME, text: 'te la paso' });
    const req = http.expectOne((r) => r.url.endsWith('/leads/p/transfer'));
    expect(req.request.body).toEqual({ toUserId: ME, note: 'te la paso' });
    req.flush(lead('p', { _id: ME, name: 'Yo Mismo', email: 'me@x.pe' }));
    expect(c.assignMode()).toBeNull();
    http.match(() => true).forEach((r) => r.flush([]));
  });

  it('soltar manda el motivo y el alta puede ir a la bolsa', async () => {
    await setup([lead('m', { _id: ME, name: 'Yo Mismo', email: 'me@x.pe' })]);
    const c = fixture.componentInstance;
    c.openDetail(c.columns()[0].leads[0]);
    http.expectOne((r) => r.url.endsWith('/activities')).flush([]);
    c.assignMode.set('release');
    c.doAssign({ text: 'No es mi zona' });
    const rel = http.expectOne((r) => r.url.endsWith('/leads/m/release'));
    expect(rel.request.body).toEqual({ reason: 'No es mi zona' });
    rel.flush(lead('m'));
    http.match(() => true).forEach((r) => r.flush([]));

    c.openNew();
    expect(c.form.ownerId).toBe(ME);
    c.form.title = 'Nueva';
    c.form.newCustomerName = 'Luis';
    c.form.ownerId = '';
    c.save();
    const create = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/leads'));
    expect(create.request.body.ownerId).toBe('');
    create.flush(lead('n'));
    http.match(() => true).forEach((r) => r.flush([]));
  });
});

describe('LeadAssignComponent', () => {
  it('no ofrece al responsable actual y exige destino para derivar', () => {
    const f = TestBed.createComponent(LeadAssignComponent);
    f.componentRef.setInput('owners', [
      { _id: 'a', name: 'Ana', email: 'a@x', role: 'X', openLeads: 2 },
      { _id: 'b', name: 'Beto', email: 'b@x', role: 'X' },
    ]);
    f.componentRef.setInput('currentOwnerId', 'a');
    f.detectChanges();
    const c = f.componentInstance;
    expect(c.candidates().map((o) => o._id)).toEqual(['b']);
    const out = vi.fn();
    c.confirm.subscribe(out);
    c.submit();
    expect(out).not.toHaveBeenCalled();
    c.to.set('b');
    c.text = ' ojo ';
    c.submit();
    expect(out).toHaveBeenCalledWith({ toUserId: 'b', text: 'ojo' });
  });
});
