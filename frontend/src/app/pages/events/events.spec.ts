import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { EventsComponent } from './events';
import { filterEvents, pickLocal } from './events-filter';
import { EventsApiService } from '../../core/api/events-api.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AppEvent } from '../../shared/models/event.model';

const toast = { success: vi.fn(), error: vi.fn() };
const confirm = { confirm: vi.fn() };
const api = { getLocals: vi.fn(), getEvents: vi.fn(), deleteEvent: vi.fn() };

const ev = (p: Partial<AppEvent>): AppEvent =>
  ({ _id: 'e', localId: 'l1', title: 'Ev', date: '2026-11-30', status: 'published', price: 0, capacity: 0, slug: 'ev', ...p } as AppEvent);

describe('events-filter (HU28)', () => {
  const today = new Date(2026, 10, 22);
  const list = [
    ev({ _id: 'a', date: '2026-12-10' }),
    ev({ _id: 'b', date: '2026-11-22' }),
    ev({ _id: 'c', date: '2026-10-01' }),
    ev({ _id: 'd', date: '2026-11-01' }),
    ev({ _id: 'z', date: '2026-12-01', status: 'draft' }),
  ];

  it('C4: próximos (hoy incluido) de antes a después; pasados del más reciente; borradores aparte', () => {
    expect(filterEvents(list, 'upcoming', today).map(e => e._id)).toEqual(['b', 'a']);
    expect(filterEvents(list, 'past', today).map(e => e._id)).toEqual(['d', 'c']);
    expect(filterEvents(list, 'drafts', today).map(e => e._id)).toEqual(['z']);
  });

  it('C1: un solo local se elige solo; con varios, el guardado si existe', () => {
    expect(pickLocal([{ _id: 'l1', name: 'A' }], null)).toBe('l1');
    const two = [{ _id: 'l1', name: 'A' }, { _id: 'l2', name: 'B' }];
    expect(pickLocal(two, 'l2')).toBe('l2');
    expect(pickLocal(two, 'borrado')).toBe('');
    expect(pickLocal(two, null)).toBe('');
  });
});

describe('EventsComponent (HU28)', () => {
  let router: Router;

  function create() {
    const fixture = TestBed.createComponent(EventsComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [EventsComponent],
      providers: [
        { provide: EventsApiService, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    api.getEvents.mockReturnValue(of([ev({ _id: 'e1' })]));
  });

  it('C1: con un local carga sus eventos sin elegir y lo recuerda', () => {
    api.getLocals.mockReturnValue(of([{ _id: 'l1', name: 'Bar' }]));
    const cmp = create().componentInstance;
    expect(cmp.selectedLocalId()).toBe('l1');
    expect(api.getEvents).toHaveBeenCalledWith('l1');
    expect(localStorage.getItem('maya.events.localId')).toBe('l1');
  });

  it('C1: con varios locales usa el último guardado', () => {
    localStorage.setItem('maya.events.localId', 'l2');
    api.getLocals.mockReturnValue(of([{ _id: 'l1', name: 'A' }, { _id: 'l2', name: 'B' }]));
    expect(create().componentInstance.selectedLocalId()).toBe('l2');
  });

  it('C2: tocar la tarjeta abre el detalle y "Asistentes" abre esa pestaña', () => {
    api.getLocals.mockReturnValue(of([{ _id: 'l1', name: 'Bar' }]));
    const fixture = create();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.event-card') as HTMLElement).click();
    expect(router.navigate).toHaveBeenCalledWith(['/events', 'e1'], {});
    fixture.componentInstance.openEventDetail(ev({ _id: 'e1' }), 'registrations');
    expect(router.navigate).toHaveBeenLastCalledWith(['/events', 'e1'], { queryParams: { tab: 'registrations' } });
  });

  it('C3: con menú nativo comparte la URL; sin él abre el modal con QR generado en local', async () => {
    api.getLocals.mockReturnValue(of([{ _id: 'l1', name: 'Bar' }]));
    const cmp = create().componentInstance;
    const shareFn = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: shareFn, configurable: true });
    await cmp.share(ev({ slug: 'cena', title: 'Cena' }));
    expect(shareFn).toHaveBeenCalledWith(expect.objectContaining({ url: `${window.location.origin}/e/cena` }));
    expect(cmp.qrModalOpen()).toBe(false);

    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    await cmp.share(ev({ slug: 'cena', title: 'Cena' }));
    expect(cmp.qrModalOpen()).toBe(true);
    // El import dinámico de qrcode tarda más con la suite completa en paralelo.
    await vi.waitFor(() => expect(cmp.qrDataUrl()).toMatch(/^data:image\/png/), { timeout: 8000 });
  });
});
