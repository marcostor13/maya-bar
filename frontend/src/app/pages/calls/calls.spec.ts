import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { CallsPageComponent, dayBound } from './calls';
import { CallsService } from '../../shared/calls/calls.service';
import { ConversationsRealtimeService, type CallEvent } from '../../shared/conversations-realtime';
import { ToastService } from '../../shared/toast';

const ROW = {
  _id: 'c1', accountId: 'a1', accountLabel: 'Ventas', direction: 'inbound', status: 'completed',
  contact: '51999888777', contactName: 'Ana', customerId: 'cu1', conversationId: 'cv1',
  answeredByName: 'Luis', startedAt: '2026-11-09T10:00:00Z', durationSec: 192,
};

describe('CallsPageComponent', () => {
  let fixture: ComponentFixture<CallsPageComponent>;
  let http: HttpTestingController;
  let events: Subject<CallEvent>;
  const toast = { error: vi.fn() };
  const calls = { loadOptions: vi.fn(), open: vi.fn() };
  const el = () => fixture.nativeElement as HTMLElement;
  const list = () => http.expectOne((r) => r.method === 'GET' && /\/calls$/.test(r.url));
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); fixture.detectChanges(); };

  beforeEach(async () => {
    vi.clearAllMocks();
    events = new Subject<CallEvent>();
    calls.loadOptions.mockResolvedValue({
      accounts: [{ _id: 'a1', label: 'Ventas' }, { _id: 'a2', label: 'Soporte' }],
      users: [{ _id: 'u1', name: 'Luis' }], iceServers: [],
    });
    TestBed.configureTestingModule({
      imports: [CallsPageComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast },
        { provide: CallsService, useValue: calls },
        { provide: ConversationsRealtimeService, useValue: { call$: events } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CallsPageComponent);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('lista llamadas con estado, duración, quién atendió y acciones', async () => {
    expect(el().textContent).toContain('Cargando llamadas');
    list().flush({ items: [ROW], total: 1, page: 1, pages: 1 });
    await settle();
    const row = el().querySelector('tbody tr')!;
    expect(row.textContent).toContain('Ana');
    expect(row.textContent).toContain('Completada');
    expect(row.textContent).toContain('3 min 12 s');
    expect(row.textContent).toContain('Luis');

    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    row.querySelector<HTMLButtonElement>('[aria-label="Ver ficha del contacto"]')!.click();
    expect(nav).toHaveBeenCalledWith(['/customers'], { queryParams: { view: 'cu1' } });
    row.querySelector<HTMLButtonElement>('[aria-label="Abrir conversación"]')!.click();
    expect(nav).toHaveBeenCalledWith(['/inbox'], { queryParams: { c: 'cv1' } });
    row.querySelector<HTMLButtonElement>('[aria-label^="Devolver llamada"]')!.click();
    expect(calls.open).toHaveBeenCalledWith({ contact: '51999888777', contactName: 'Ana', accountId: 'a1' });
  });

  it('los filtros viajan a la API y vuelven a la primera página', async () => {
    list().flush({ items: [ROW], total: 120, page: 1, pages: 3 });
    await settle();
    const c = fixture.componentInstance;
    c.status = 'missed';
    c.direction = 'inbound';
    c.userId = 'u1';
    c.accountId = 'a2';
    c.from = '2026-11-01';
    c.to = '2026-11-09';
    c.apply();
    const req = list();
    const p = req.request.params;
    expect(p.get('page')).toBe('1');
    expect(p.get('status')).toBe('missed');
    expect(p.get('direction')).toBe('inbound');
    expect(p.get('userId')).toBe('u1');
    expect(p.get('accountId')).toBe('a2');
    expect(p.get('from')).toBe(dayBound('2026-11-01', false));
    expect(p.get('to')).toBe(dayBound('2026-11-09', true));
    req.flush({ items: [], total: 0, page: 1, pages: 1 });
    await settle();
    expect(el().textContent).toContain('Ninguna llamada coincide');
  });

  it('pagina', async () => {
    list().flush({ items: [ROW], total: 120, page: 1, pages: 3 });
    await settle();
    el().querySelector<HTMLButtonElement>('[aria-label="Página siguiente"]')!.click();
    expect(list().request.params.get('page')).toBe('2');
  });

  it('vacío sin filtros y error con reintento', async () => {
    list().flush({ items: [], total: 0, page: 1, pages: 1 });
    await settle();
    expect(el().textContent).toContain('Todavía no hay llamadas');
    fixture.componentInstance.load();
    list().flush({ message: 'Fallo' }, { status: 500, statusText: 'Error' });
    await settle();
    expect(el().querySelector('[role="alert"]')!.textContent).toContain('Fallo');
    expect(toast.error).toHaveBeenCalledWith('Fallo');
  });

  it('al terminar una llamada se recarga', async () => {
    list().flush({ items: [], total: 0, page: 1, pages: 1 });
    await settle();
    events.next({ event: 'call:ended', payload: { id: 'x', status: 'missed' } });
    list().flush({ items: [ROW], total: 1, page: 1, pages: 1 });
  });

  it('dayBound usa el inicio y el final del día local', () => {
    list().flush({ items: [], total: 0, page: 1, pages: 1 });
    expect(new Date(dayBound('2026-11-09', false)!).getHours()).toBe(0);
    expect(new Date(dayBound('2026-11-09', true)!).getHours()).toBe(23);
    expect(dayBound('', true)).toBeUndefined();
  });
});
