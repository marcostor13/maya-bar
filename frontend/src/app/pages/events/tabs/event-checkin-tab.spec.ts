import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { EventCheckinTabComponent } from './event-checkin-tab';
import { EventDetailStore } from '../event-detail.store';
import { EventsApiService } from '../../../core/api/events-api.service';
import { ToastService } from '../../../shared/toast';
import { Registration } from '../../../shared/models/event.model';
import { matchesCheckin, outcomeFromError, outcomeFromResult, vibrationFor } from './checkin-logic';

const mockToast = { success: vi.fn(), error: vi.fn() };
const mockApi = {
  checkIn: vi.fn(),
  checkInByCode: vi.fn(),
  undoCheckIn: vi.fn(),
};

function reg(partial: Partial<Registration>): Registration {
  return {
    _id: 'r1', name: 'Ana', email: 'ana@mail.com', partySize: 2,
    ticketCode: 'TCK-001', status: 'confirmed', checkedIn: false,
    createdAt: '2026-07-01T12:00:00.000Z',
    ...partial,
  };
}

describe('checkin-logic (HU30)', () => {
  it('C1: verde, ámbar y rojo según el resultado', () => {
    const ok = outcomeFromResult({ ...reg({ partySize: 3 }), impulsadorName: null, alreadyCheckedIn: false });
    expect(ok.kind).toBe('ok');
    expect(ok.detail).toContain('Grupo de 3');
    const already = outcomeFromResult({ ...reg({ checkedInAt: '2026-11-22T02:04:00Z' }), impulsadorName: null, alreadyCheckedIn: true });
    expect(already.kind).toBe('already');
    expect(already.detail).toMatch(/Entró a las/);
    expect(outcomeFromError({ status: 404 }).title).toBe('Entrada no válida');
    expect(outcomeFromError({ status: 409, error: { message: 'cancelado' } })).toMatchObject({ kind: 'error', detail: 'cancelado' });
    expect(vibrationFor('ok')).not.toEqual(vibrationFor('error'));
  });

  it('C3: busca por teléfono ignorando espacios y signos', () => {
    const r = reg({ phone: '+51 999 123 456' });
    expect(matchesCheckin(r, '999123')).toBe(true);
    expect(matchesCheckin(r, 'tck-001')).toBe(true);
    expect(matchesCheckin(r, 'zzz')).toBe(false);
  });
});

describe('EventCheckinTabComponent (HU30)', () => {
  let component: EventCheckinTabComponent;
  let store: EventDetailStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [EventCheckinTabComponent],
      providers: [
        EventDetailStore,
        { provide: EventsApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    store = TestBed.inject(EventDetailStore);
    store.eventId.set('ev-1');
    const all = [
      reg({ _id: 'r1', name: 'Ana López', email: 'ana@mail.com', ticketCode: 'TCK-001', partySize: 2 }),
      reg({ _id: 'r2', name: 'Bruno Díaz', email: 'bruno@mail.com', ticketCode: 'TCK-002', checkedIn: true, partySize: 3 }),
      reg({ _id: 'r3', name: 'Carla Ruiz', email: 'carla@mail.com', ticketCode: 'TCK-003', status: 'cancelled', partySize: 4 }),
    ];
    store.allRegistrations.set(all);
    store.registrations.set(all);

    const fixture = TestBed.createComponent(EventCheckinTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('C2: cuenta personas de los confirmados arriba y abajo', () => {
    expect(component.checkedInCount()).toBe(3);
    expect(component.totalAttendees()).toBe(5);
    expect(store.attendanceRate()).toBe(60);
  });

  it('C3: no muestra cancelados y no depende del filtro de Asistentes', () => {
    expect(component.list().map(r => r._id)).toEqual(['r1', 'r2']);
    store.registrations.set([]); // Asistentes filtró a nada
    expect(component.list()).toHaveLength(2);
    component.search.set('bruno');
    expect(component.list().map(r => r._id)).toEqual(['r2']);
  });

  it('da ingreso, actualiza las dos listas y ofrece deshacer', () => {
    const target = store.allRegistrations()[0];
    mockApi.checkIn.mockReturnValue(of({ ...target, checkedIn: true }));
    component.doCheckIn(target);
    expect(mockApi.checkIn).toHaveBeenCalledWith('ev-1', 'r1');
    expect(store.allRegistrations()[0].checkedIn).toBe(true);
    expect(store.registrations()[0].checkedIn).toBe(true);
    expect(component.checkedInCount()).toBe(5);
    expect(component.undo()?._id).toBe('r1');
  });

  it('C5: deshacer llama al DELETE y el contador baja', () => {
    const target = store.allRegistrations()[0];
    mockApi.checkIn.mockReturnValue(of({ ...target, checkedIn: true }));
    component.doCheckIn(target);
    mockApi.undoCheckIn.mockReturnValue(of({ ...target, checkedIn: false }));
    component.undoLast();
    expect(mockApi.undoCheckIn).toHaveBeenCalledWith('ev-1', 'r1');
    expect(component.checkedInCount()).toBe(3);
    expect(component.undo()).toBeNull();
  });

  it('en error muestra el motivo y no modifica el registro', () => {
    const target = store.allRegistrations()[0];
    mockApi.checkIn.mockReturnValue(throwError(() => ({ error: { message: 'El registro está cancelado' } })));
    component.doCheckIn(target);
    expect(store.allRegistrations()[0].checkedIn).toBe(false);
    expect(mockToast.error).toHaveBeenCalledWith('El registro está cancelado');
    expect(component.checkingInId()).toBeNull();
  });

  it('C1: una lectura válida da verde y vibra; un código inválido, rojo; el escáner sigue abierto', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    component.scannerOpen.set(true);
    const target = store.allRegistrations()[0];
    mockApi.checkInByCode.mockReturnValue(of({ ...target, checkedIn: true, impulsadorName: null, alreadyCheckedIn: false }));
    await component.onQrDecoded('TCK-001');
    expect(component.result()?.kind).toBe('ok');
    expect(vibrate).toHaveBeenCalledWith([80]);
    expect(component.scannerOpen()).toBe(true);

    (component as unknown as { scanLocked: boolean }).scanLocked = false;
    mockApi.checkInByCode.mockReturnValue(throwError(() => ({ status: 404 })));
    await component.onQrDecoded('NOPE');
    expect(component.result()?.kind).toBe('error');
    expect(vibrate).toHaveBeenLastCalledWith([300]);
  });
});
