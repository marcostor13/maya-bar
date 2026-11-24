import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RoutingSettingsComponent, type RoutingRule } from './routing-settings';
import { RoutingAvailabilityComponent } from '../leads/routing-availability';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/routing`;
const RULE: RoutingRule = {
  _id: 'r1', name: 'WhatsApp', active: true, appliesTo: 'leads', match: { kind: 'contact_source', value: 'whatsapp' },
  mode: 'round_robin', members: [{ userId: { _id: 'u1', name: 'Ana' }, weight: 1 }], responseMinutes: 15, onTimeout: 'next',
};
const OWNERS = [
  { _id: 'u1', name: 'Ana', email: 'a@x', role: 'MANAGER', openLeads: 2 },
  { _id: 'u2', name: 'Beto', email: 'b@x', role: 'IMPULSADOR', openLeads: 0 },
  { _id: 'u3', name: 'Caja', email: 'c@x', role: 'CASHIER', openLeads: 0 },
];

describe('Reparto automático (HU59)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn().mockResolvedValue(true) };

  async function configure() {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast }, { provide: ConfirmService, useValue: confirm }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  }

  async function setup() {
    await configure();
    const f = TestBed.createComponent(RoutingSettingsComponent);
    f.detectChanges();
    http.expectOne(`${API}/rules`).flush([RULE]);
    http.expectOne(`${API}/log?limit=20`).flush([
      { _id: 'l1', at: '2026-11-24T15:00:00Z', reason: 'timeout_next', userId: { name: 'Beto' }, fromUserId: { name: 'Ana' }, leadId: { title: 'Op 1' } },
    ]);
    http.expectOne(`${environment.apiUrl}/leads/owners`).flush(OWNERS);
    f.detectChanges();
    return f;
  }
  const reload = () => {
    http.expectOne(`${API}/rules`).flush([RULE]);
    http.expectOne(`${API}/log?limit=20`).flush([]);
  };
  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('lista reglas y bitácora; el grupo solo ofrece vendedores', async () => {
    const f = await setup();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('WhatsApp');
    expect(el.textContent).toContain('Canal: whatsapp');
    expect(el.textContent).toContain('Responder en 15 min');
    expect(el.textContent).toContain('Ana no respondió; pasó a Beto');
    expect(f.componentInstance.sellers().map((o) => o._id)).toEqual(['u1', 'u2']);
  });

  it('crea una regla con el grupo elegido y exige vendedores', async () => {
    const f = await setup();
    const c = f.componentInstance;
    c.openNew();
    c.editing()!.name = 'Todas';
    c.save();
    expect(toast.error).toHaveBeenCalledWith('Añade al menos un vendedor al grupo');
    c.setMember('u1', true);
    c.setMember('u2', true);
    c.setMember('u1', false);
    c.save();
    const req = http.expectOne(`${API}/rules`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ name: 'Todas', mode: 'round_robin', members: [{ userId: 'u2', weight: 1 }] });
    req.flush({});
    reload();
    expect(toast.success).toHaveBeenCalledWith('Regla guardada');
    expect(c.editing()).toBeNull();
  });

  it('elimina con confirmación', async () => {
    const f = await setup();
    await f.componentInstance.remove(RULE);
    expect(confirm.confirm).toHaveBeenCalled();
    http.expectOne(`${API}/rules/r1`).flush({ deleted: true });
    reload();
    expect(toast.success).toHaveBeenCalledWith('Regla eliminada');
  });

  it('el interruptor Disponible cambia la propia disponibilidad', async () => {
    await configure();
    const f = TestBed.createComponent(RoutingAvailabilityComponent);
    f.detectChanges();
    http.expectOne(`${API}/availability`).flush({ available: true, availability: null });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Disponible');
    f.componentInstance.toggle();
    const req = http.expectOne(`${API}/availability`);
    expect(req.request.body).toEqual({ available: false });
    req.flush({ available: false, availability: null });
    f.detectChanges();
    expect(el.textContent).toContain('No disponible');
    f.componentInstance.openSchedule();
    f.componentInstance.toggleDay(1);
    f.componentInstance.saveSchedule();
    const s = http.expectOne(`${API}/availability`);
    expect(s.request.body).toEqual({ availability: { days: [1], from: 9, to: 18 } });
    s.flush({ available: false, availability: { days: [1], from: 9, to: 18 } });
    expect(toast.success).toHaveBeenCalledWith('Horario guardado');
  });
});
