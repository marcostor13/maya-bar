import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { EventRegistrationsTabComponent } from './event-registrations-tab';
import { EventDetailStore } from '../event-detail.store';
import { EventsApiService } from '../../../core/api/events-api.service';
import { ToastService } from '../../../shared/toast';
import { AppEvent, Registration } from '../../../shared/models/event.model';

const mockToast = { success: vi.fn(), error: vi.fn() };
const mockApi = {
  getRegistrations: vi.fn(),
};

function reg(partial: Partial<Registration>): Registration {
  return {
    _id: 'r1', name: 'Ana', email: 'ana@mail.com', partySize: 2,
    ticketCode: 'TCK-001', status: 'confirmed', checkedIn: false,
    createdAt: '2026-07-01T12:00:00.000Z',
    ...partial,
  };
}

describe('EventRegistrationsTabComponent', () => {
  let component: EventRegistrationsTabComponent;
  let store: EventDetailStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockApi.getRegistrations.mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [EventRegistrationsTabComponent],
      providers: [
        EventDetailStore,
        { provide: EventsApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    store = TestBed.inject(EventDetailStore);
    store.eventId.set('ev-1');
    const fixture = TestBed.createComponent(EventRegistrationsTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('filtrado', () => {
    it('onRegSearchChange actualiza regSearch y recarga con debounce de 350ms', () => {
      vi.useFakeTimers();
      component.onRegSearchChange('ana');
      expect(store.regSearch()).toBe('ana');
      expect(mockApi.getRegistrations).not.toHaveBeenCalled();

      vi.advanceTimersByTime(350);
      expect(mockApi.getRegistrations).toHaveBeenCalledWith('ev-1', {
        sortBy: 'createdAt', sortOrder: 'desc', status: undefined, search: 'ana',
      });
      vi.useRealTimers();
    });

    it('onRegFilterChange recarga con el filtro de estado activo', () => {
      store.regStatusFilter.set('confirmed');
      component.onRegFilterChange();
      expect(mockApi.getRegistrations).toHaveBeenCalledWith('ev-1', {
        sortBy: 'createdAt', sortOrder: 'desc', status: 'confirmed', search: undefined,
      });
    });

    it('setSortBy cambia de campo con orden asc y alterna asc/desc en el mismo campo', () => {
      component.setSortBy('name');
      expect(store.regSortBy()).toBe('name');
      expect(store.regSortOrder()).toBe('asc');

      component.setSortBy('name');
      expect(store.regSortOrder()).toBe('desc');
      expect(mockApi.getRegistrations).toHaveBeenCalledTimes(2);
    });
  });

  describe('expansión', () => {
    it('toggleExpandReg agrega y quita el id del set', () => {
      component.toggleExpandReg('r1');
      expect(component.expandedRegIds().has('r1')).toBe(true);
      component.toggleExpandReg('r1');
      expect(component.expandedRegIds().has('r1')).toBe(false);
    });

    it('hasCustomFields detecta respuestas no vacías', () => {
      expect(component.hasCustomFields({ a: '' })).toBe(false);
      expect(component.hasCustomFields({ a: 'Vegano' })).toBe(true);
    });
  });

  describe('export', () => {
    let anchor: HTMLAnchorElement | undefined;
    let capturedBlob: Blob | undefined;

    beforeEach(() => {
      anchor = undefined;
      capturedBlob = undefined;
      const origCreate = Document.prototype.createElement;
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate.call(document, tag);
        if (tag === 'a') anchor = el as HTMLAnchorElement;
        return el;
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { capturedBlob = b as Blob; return 'blob:mock'; });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    });

    afterEach(() => vi.restoreAllMocks());

    it('downloadExcel genera el CSV con headers, campos custom y notifica', async () => {
      store.event.set({ _id: 'ev-1', title: 'Cena', localId: 'l1', date: '2026-07-10', capacity: 0, price: 50, status: 'published' } as AppEvent);
      store.formFields.set([{ id: 'f1', label: 'Restricción', type: 'text', required: false, options: [] }]);
      store.registrations.set([
        reg({ customFields: { f1: 'Vegano' }, impulsadorName: 'Juan', checkedIn: true }),
      ]);

      component.downloadExcel();

      expect(anchor?.download).toContain('asistentes_Cena_');
      const csv = await capturedBlob!.text();
      const [headerLine, row] = csv.split('\r\n');
      expect(headerLine).toContain('"Ticket","Nombre","Email","Teléfono","Personas","Impulsador","Estado","Check-in","Fecha Registro","Restricción"');
      expect(row).toContain('"TCK-001"');
      expect(row).toContain('"Juan"');
      expect(row).toContain('"Sí"');
      expect(row).toContain('"Vegano"');
      expect(mockToast.success).toHaveBeenCalledWith('Archivo descargado');
    });

    it('downloadExcel usa "Directo" sin impulsador y "evento" sin título', async () => {
      store.registrations.set([reg({})]);

      component.downloadExcel();

      expect(anchor?.download).toContain('asistentes_evento_');
      const csv = await capturedBlob!.text();
      expect(csv.split('\r\n')[1]).toContain('"Directo"');
    });
  });
});
