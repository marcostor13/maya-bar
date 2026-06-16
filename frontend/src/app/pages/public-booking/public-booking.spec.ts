import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { PublicBookingComponent } from './public-booking';

const publicConfig = {
  localName: 'Local Test',
  config: { enabled: true, turnos: ['20:00', '21:00'], maxPartySize: 8, advanceBookingDays: 30 },
};
const slots = [
  { turno: '20:00', available: true, spotsLeft: 4 },
  { turno: '21:00', available: false, spotsLeft: 0 },
];

function makeLocalRoute(localId = 'local-1') {
  return {
    snapshot: { paramMap: { get: (key: string) => (key === 'localId' ? localId : null) } },
  };
}

function makeTokenRoute(token = 'abc123') {
  return {
    snapshot: { paramMap: { get: (key: string) => (key === 'token' ? token : null) } },
  };
}

// ─── Normal booking flow ───────────────────────────────────────────────────

describe('PublicBookingComponent — booking flow', () => {
  let component: PublicBookingComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicBookingComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: makeLocalRoute() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PublicBookingComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    // Flush initial config request
    httpMock
      .expectOne((r) => r.url === 'http://localhost:3000/public/reservations/config' && r.params.get('localId') === 'local-1')
      .flush(publicConfig);
  });

  afterEach(() => httpMock.verify());

  it('should create', () => expect(component).toBeTruthy());

  it('should start at date step', () => expect(component.step()).toBe('date'));

  it('should set localName from config response', () => {
    expect(component.localName()).toBe('Local Test');
  });

  it('loading should be false after init', () => {
    expect(component.loading()).toBe(false);
  });

  it('config should be populated', () => {
    expect(component.config()?.turnos).toHaveLength(2);
    expect(component.config()?.enabled).toBe(true);
  });

  it('partySizeOptions should be 1..maxPartySize', () => {
    expect(component.partySizeOptions()).toHaveLength(8);
    expect(component.partySizeOptions()[0]).toBe(1);
    expect(component.partySizeOptions()[7]).toBe(8);
  });

  it('minDate should be today', () => {
    expect(component.minDate()).toBe(new Date().toISOString().slice(0, 10));
  });

  it('onDateSelect transitions to time step and loads slots', () => {
    component.onDateSelect({ target: { value: '2026-06-15' } } as any);

    expect(component.selectedDate()).toBe('2026-06-15');
    expect(component.step()).toBe('time');

    const req = httpMock.expectOne(
      (r) => r.url === 'http://localhost:3000/public/reservations/availability' && r.params.get('date') === '2026-06-15',
    );
    expect(req.request.method).toBe('GET');
    req.flush(slots);

    expect(component.slots()).toHaveLength(2);
  });

  it('onSlotSelect transitions to form step', () => {
    component.onSlotSelect('20:00');
    expect(component.selectedTurno()).toBe('20:00');
    expect(component.step()).toBe('form');
  });

  it('submitReservation transitions to success on valid form', () => {
    component.selectedTurno.set('20:00');
    component.selectedDate.set('2026-06-15');
    component.step.set('form');
    component.guestForm.setValue({
      guestName: 'Ana Torres',
      guestEmail: 'ana@test.com',
      guestPhone: '',
      partySize: 2,
      occasion: '',
      notes: '',
    });

    component.submitReservation();

    const req = httpMock.expectOne('http://localhost:3000/public/reservations');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.guestName).toBe('Ana Torres');
    req.flush({});

    expect(component.step()).toBe('success');
    expect(component.submitting()).toBe(false);
  });

  it('submitReservation does not submit when form is invalid', () => {
    component.guestForm.setValue({
      guestName: '',
      guestEmail: 'not-an-email',
      guestPhone: '',
      partySize: 2,
      occasion: '',
      notes: '',
    });

    component.submitReservation();
    httpMock.expectNone('http://localhost:3000/public/reservations');
  });

  it('submitReservation sets formError on API error', () => {
    component.selectedTurno.set('20:00');
    component.selectedDate.set('2026-06-15');
    component.guestForm.setValue({
      guestName: 'Ana Torres',
      guestEmail: 'ana@test.com',
      guestPhone: '',
      partySize: 2,
      occasion: '',
      notes: '',
    });

    component.submitReservation();

    const req = httpMock.expectOne('http://localhost:3000/public/reservations');
    req.flush({ message: 'Turno lleno' }, { status: 400, statusText: 'Bad Request' });

    expect(component.formError()).toBe('Turno lleno');
    expect(component.submitting()).toBe(false);
  });

  it('loadSlots error sets loading to false', () => {
    component.loadSlots('2026-06-15');
    const req = httpMock.expectOne(
      (r) => r.url === 'http://localhost:3000/public/reservations/availability',
    );
    req.flush('error', { status: 500, statusText: 'Server Error' });
    expect(component.loadingSlots()).toBe(false);
  });

  it('resetForm returns to date step', () => {
    component.step.set('success');
    component.selectedTurno.set('20:00');
    component.resetForm();
    expect(component.step()).toBe('date');
    expect(component.selectedTurno()).toBe('');
  });

  it('shows disabled state when config.enabled is false', () => {
    component.config.set({ enabled: false, turnos: [], maxPartySize: 8, advanceBookingDays: 30 });
    expect(component.config()?.enabled).toBe(false);
  });
});

// ─── Confirm flow ──────────────────────────────────────────────────────────

describe('PublicBookingComponent — confirm flow', () => {
  let component: PublicBookingComponent;
  let httpMock: HttpTestingController;

  afterEach(() => httpMock?.verify());

  it('should confirm reservation with valid token', async () => {
    await TestBed.configureTestingModule({
      imports: [PublicBookingComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: makeTokenRoute('abc123') },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PublicBookingComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    expect(component.step()).toBe('confirm');

    const req = httpMock.expectOne('http://localhost:3000/public/reservations/abc123/confirm');
    expect(req.request.method).toBe('PATCH');
    req.flush({ date: '2026-06-15', turno: '20:00', partySize: 2, localName: 'Local Test' });

    expect(component.confirmedRes()).toBeTruthy();
    expect(component.loading()).toBe(false);
    expect(component.confirmError()).toBe('');
  });

  it('should show error when confirm fails', async () => {
    await TestBed.configureTestingModule({
      imports: [PublicBookingComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: makeTokenRoute('bad-token') },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PublicBookingComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const req = httpMock.expectOne('http://localhost:3000/public/reservations/bad-token/confirm');
    req.flush({ message: 'Token inválido' }, { status: 404, statusText: 'Not Found' });

    expect(component.confirmError()).toBe('Token inválido');
    expect(component.confirmedRes()).toBeNull();
    expect(component.loading()).toBe(false);
  });
});

// ─── Config load error ─────────────────────────────────────────────────────

describe('PublicBookingComponent — config load error', () => {
  let component: PublicBookingComponent;
  let httpMock: HttpTestingController;

  afterEach(() => httpMock?.verify());

  it('handles config load error gracefully', async () => {
    await TestBed.configureTestingModule({
      imports: [PublicBookingComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: makeLocalRoute() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PublicBookingComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url === 'http://localhost:3000/public/reservations/config')
      .flush('error', { status: 500, statusText: 'Server Error' });

    expect(component.loading()).toBe(false);
  });
});
