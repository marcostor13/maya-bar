import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Router, provideRouter } from '@angular/router';
import { EventDetailStore } from './event-detail.store';
import { EventDetailComponent } from './event-detail';
import { EventMediaTabComponent } from './tabs/event-media-tab';
import { initialTab, isTab, TAB_GROUP, GROUP_FIRST, SAVE_TABS } from './event-tabs';
import { EventsApiService } from '../../core/api/events-api.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const toast = { success: vi.fn(), error: vi.fn() };
const confirm = { confirm: vi.fn() };
const api = {
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
};

describe('HU29 · pestañas del detalle', () => {
  const today = new Date(2026, 10, 22, 15, 0);

  it('C4: publicado hoy → Check-in; futuro → Asistentes; resto → General', () => {
    expect(initialTab({ status: 'published', date: '2026-11-22T00:00:00.000Z' }, today)).toBe('checkin');
    expect(initialTab({ status: 'published', date: '2026-12-01' }, today)).toBe('registrations');
    expect(initialTab({ status: 'published', date: '2026-11-01' }, today)).toBe('general');
    expect(initialTab({ status: 'draft', date: '2026-11-22' }, today)).toBe('general');
  });

  it('C3: cada pestaña pertenece a un grupo y cada grupo tiene su primera pestaña', () => {
    expect(Object.keys(TAB_GROUP)).toHaveLength(9);
    expect(TAB_GROUP[GROUP_FIRST.config]).toBe('config');
    expect(TAB_GROUP[GROUP_FIRST.ops]).toBe('ops');
    expect([...SAVE_TABS].every(t => TAB_GROUP[t] === 'config')).toBe(true);
    expect(isTab('checkin')).toBe(true);
    expect(isTab('nope')).toBe(false);
  });
});

describe('HU29 · cambios sin guardar', () => {
  let store: EventDetailStore;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        EventDetailStore,
        { provide: EventsApiService, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    store = TestBed.inject(EventDetailStore);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    store.form.patchValue({ title: 'Cena', date: '2026-12-01' });
    store.markSaved();
  });

  it('C1: añadir una pregunta, un medio o cambiar la descripción marca cambios; guardar los limpia', () => {
    expect(store.dirty()).toBe(false);
    store.formFields.set([{ id: 'f1', label: '¿Alergias?', type: 'text', required: false, options: [] }]);
    expect(store.dirty()).toBe(true);

    store.markSaved();
    store.mediaFiles.set([{ url: 'u', key: 'k', name: 'a.png', mimeType: 'image/png', size: 1 }]);
    expect(store.dirty()).toBe(true);

    store.markSaved();
    store.form.patchValue({ description: 'Menú de 5 tiempos' });
    expect(store.dirty()).toBe(true);
  });

  it('C1/C5: guardar envía descripción, medios y preguntas y deja de estar sucio', () => {
    store.eventId.set('ev1');
    store.form.patchValue({ description: 'Menú de 5 tiempos' });
    store.formFields.set([{ id: 'f1', label: 'P', type: 'text', required: false, options: [] }]);
    api.updateEvent.mockReturnValue(of({ _id: 'ev1' }));
    store.saveEvent();
    const body = api.updateEvent.mock.calls[0][1];
    expect(body).toMatchObject({ description: 'Menú de 5 tiempos', formFields: [{ id: 'f1' }] });
    expect(store.dirty()).toBe(false);
  });

  it('al crear, marca guardado antes de navegar (el guard no pregunta)', () => {
    store.isNew.set(true);
    store.localId.set('l1');
    store.formFields.set([{ id: 'f1', label: 'P', type: 'text', required: false, options: [] }]);
    const router = TestBed.inject(Router);
    api.createEvent.mockReturnValue(of({ _id: 'new1' }));
    (router.navigate as ReturnType<typeof vi.fn>).mockImplementation(() => {
      expect(store.dirty()).toBe(false);
      return Promise.resolve(true);
    });
    store.saveEvent();
    expect(router.navigate).toHaveBeenCalled();
  });
});

describe('HU29 · salir con cambios', () => {
  it('C2: con cambios pide confirmación; sin cambios, no', async () => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [EventDetailComponent],
      providers: [
        provideRouter([]),
        { provide: EventsApiService, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    const fixture = TestBed.createComponent(EventDetailComponent);
    const cmp = fixture.componentInstance;
    const store = fixture.debugElement.injector.get(EventDetailStore);
    store.markSaved();

    expect(await cmp.canLeave()).toBe(true);
    expect(confirm.confirm).not.toHaveBeenCalled();

    store.formFields.set([{ id: 'f1', label: 'P', type: 'text', required: false, options: [] }]);
    confirm.confirm.mockResolvedValue(false);
    expect(await cmp.canLeave()).toBe(false);
    expect(confirm.confirm).toHaveBeenCalledTimes(1);
  });
});

describe('HU29 · medios', () => {
  it('C6: quitar un medio pide confirmación y solo lo quita si se acepta', async () => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [EventMediaTabComponent],
      providers: [
        EventDetailStore,
        { provide: EventsApiService, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    const store = TestBed.inject(EventDetailStore);
    const file = { url: 'u', key: 'k', name: 'a.png', mimeType: 'image/png', size: 1 };
    store.mediaFiles.set([file]);
    const cmp = TestBed.createComponent(EventMediaTabComponent).componentInstance;

    confirm.confirm.mockResolvedValue(false);
    await cmp.removeMedia(file);
    expect(store.mediaFiles()).toHaveLength(1);

    confirm.confirm.mockResolvedValue(true);
    await cmp.removeMedia(file);
    expect(store.mediaFiles()).toHaveLength(0);
  });
});

describe('HU29 · reordenar preguntas', () => {
  it('C7: subir y bajar una pregunta cambia el orden', async () => {
    const { EventFormTabComponent } = await import('./tabs/event-form-tab');
    TestBed.configureTestingModule({
      imports: [EventFormTabComponent],
      providers: [
        EventDetailStore,
        { provide: EventsApiService, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    const store = TestBed.inject(EventDetailStore);
    const a = { id: 'a', label: 'A', type: 'text' as const, required: false, options: [] };
    const b = { id: 'b', label: 'B', type: 'text' as const, required: false, options: [] };
    store.formFields.set([a, b]);
    const cmp = TestBed.createComponent(EventFormTabComponent).componentInstance;
    cmp.moveDown(a);
    expect(store.formFields().map(f => f.id)).toEqual(['b', 'a']);
    cmp.moveUp(a);
    expect(store.formFields().map(f => f.id)).toEqual(['a', 'b']);
  });
});
