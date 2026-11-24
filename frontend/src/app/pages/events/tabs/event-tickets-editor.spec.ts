import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EventTicketsEditorComponent } from './event-tickets-editor';
import { EventDetailStore } from '../event-detail.store';
import { EventsApiService } from '../../../core/api/events-api.service';
import { ToastService } from '../../../shared/toast';
import { environment } from '../../../../environments/environment';

describe('Editor de entradas pagadas (HU67)', () => {
  const toast = { success: vi.fn(), error: vi.fn() };
  const api = { updateEvent: vi.fn(), createEvent: vi.fn(), getRegistrations: vi.fn(() => of([])) };
  let http: HttpTestingController;
  let store: EventDetailStore;

  async function setup(connected: boolean) {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [EventTicketsEditorComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]), EventDetailStore,
        { provide: EventsApiService, useValue: api },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(EventDetailStore);
    store.eventId.set('ev-1');
    const f = TestBed.createComponent(EventTicketsEditorComponent);
    f.detectChanges();
    http.expectOne(`${environment.apiUrl}/event-tickets/mp/status`).flush({ available: true, connected, feePct: 3 });
    f.detectChanges();
    return f;
  }
  afterEach(() => http.verify());

  it('al activar crea "General" con el precio del evento, avisa si falta conectar y guarda los tipos', async () => {
    const f = await setup(false);
    store.form.patchValue({ title: 'Fiesta', date: '2030-12-31', price: 25 });
    f.componentInstance.toggle(true);
    f.detectChanges();
    expect(store.ticketTypes()).toEqual([{ name: 'General', price: 25, capacity: 0, salesEndAt: null }]);
    expect((f.nativeElement as HTMLElement).textContent).toContain('Conecta tu cuenta de Mercado Pago');

    f.componentInstance.add();
    f.componentInstance.set(1, 'name', 'VIP');
    f.componentInstance.set(1, 'price', 80);
    f.componentInstance.set(1, 'capacity', 50);
    f.componentInstance.set(1, 'salesEndAt', '2030-12-01');
    api.updateEvent.mockReturnValue(of({ _id: 'ev-1' }));
    store.saveEvent();
    const body = api.updateEvent.mock.calls[0][1] as { onlinePayment: boolean; ticketTypes: unknown[] };
    expect(body.onlinePayment).toBe(true);
    expect(body.ticketTypes).toEqual([
      { name: 'General', price: 25, capacity: 0, salesEndAt: null },
      { name: 'VIP', price: 80, capacity: 50, salesEndAt: new Date('2030-12-01').toISOString() },
    ]);
  });

  it('no deja quitar un tipo con ventas y no guarda venta en línea sin tipos', async () => {
    const f = await setup(true);
    store.form.patchValue({ title: 'Fiesta', date: '2030-12-31' });
    store.onlinePayment.set(true);
    store.ticketTypes.set([{ key: 'general', name: 'General', price: 30, capacity: 10, sold: 4 }]);
    f.detectChanges();
    const del = (f.nativeElement as HTMLElement).querySelector('[aria-label="Quitar General"]') as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect((f.nativeElement as HTMLElement).textContent).not.toContain('Conecta tu cuenta');

    store.ticketTypes.set([]);
    store.saveEvent();
    expect(toast.error).toHaveBeenCalledWith('Agrega al menos un tipo de entrada para vender en línea');
    expect(api.updateEvent).not.toHaveBeenCalled();
    expect(api.createEvent).not.toHaveBeenCalled();
  });
});
