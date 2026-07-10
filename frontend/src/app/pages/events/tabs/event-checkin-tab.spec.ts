import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { EventCheckinTabComponent } from './event-checkin-tab';
import { EventDetailStore } from '../event-detail.store';
import { EventsApiService } from '../../../core/api/events-api.service';
import { ToastService } from '../../../shared/toast';
import { Registration } from '../../../shared/models/event.model';

const mockToast = { success: vi.fn(), error: vi.fn() };
const mockApi = {
  checkIn: vi.fn(),
};

function reg(partial: Partial<Registration>): Registration {
  return {
    _id: 'r1', name: 'Ana', email: 'ana@mail.com', partySize: 2,
    ticketCode: 'TCK-001', status: 'confirmed', checkedIn: false,
    createdAt: '2026-07-01T12:00:00.000Z',
    ...partial,
  };
}

describe('EventCheckinTabComponent', () => {
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
    store.registrations.set([
      reg({ _id: 'r1', name: 'Ana López', email: 'ana@mail.com', ticketCode: 'TCK-001' }),
      reg({ _id: 'r2', name: 'Bruno Díaz', email: 'bruno@mail.com', ticketCode: 'TCK-002', checkedIn: true, partySize: 3 }),
    ]);

    const fixture = TestBed.createComponent(EventCheckinTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('filteredRegistrations', () => {
    it('sin búsqueda devuelve todos los registros', () => {
      expect(component.filteredRegistrations()).toHaveLength(2);
    });

    it('filtra por nombre, email o ticket (case-insensitive)', () => {
      component.regSearch.set('ANA');
      expect(component.filteredRegistrations().map(r => r._id)).toEqual(['r1']);

      component.regSearch.set('bruno@');
      expect(component.filteredRegistrations().map(r => r._id)).toEqual(['r2']);

      component.regSearch.set('tck-002');
      expect(component.filteredRegistrations().map(r => r._id)).toEqual(['r2']);

      component.regSearch.set('nomatch');
      expect(component.filteredRegistrations()).toHaveLength(0);
    });

    it('checkedInCount y totalAttendees reflejan los registros', () => {
      expect(component.checkedInCount()).toBe(1);
      expect(component.totalAttendees()).toBe(5);
    });
  });

  describe('doCheckIn', () => {
    it('llama al API, actualiza el registro compartido y notifica éxito', () => {
      const target = store.registrations()[0];
      mockApi.checkIn.mockReturnValue(of({ ...target, checkedIn: true }));

      component.doCheckIn(target);

      expect(mockApi.checkIn).toHaveBeenCalledWith('ev-1', 'r1');
      expect(store.registrations().find(r => r._id === 'r1')?.checkedIn).toBe(true);
      expect(mockToast.success).toHaveBeenCalledWith('Check-in de Ana López completado');
      expect(component.checkingInId()).toBeNull();
    });

    it('en error muestra toast de error y no modifica el registro', () => {
      const target = store.registrations()[0];
      mockApi.checkIn.mockReturnValue(throwError(() => new Error('fail')));

      component.doCheckIn(target);

      expect(store.registrations().find(r => r._id === 'r1')?.checkedIn).toBe(false);
      expect(mockToast.error).toHaveBeenCalledWith('No se pudo realizar el check-in');
      expect(component.checkingInId()).toBeNull();
    });

    it('no llama al API si no hay eventId', () => {
      store.eventId.set(null);
      component.doCheckIn(store.registrations()[0]);
      expect(mockApi.checkIn).not.toHaveBeenCalled();
    });
  });
});
