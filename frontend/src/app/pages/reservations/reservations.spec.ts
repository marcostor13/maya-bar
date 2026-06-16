import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ReservationsComponent } from './reservations';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AuthService } from '../../auth/auth.service';

const mockToast = { success: vi.fn(), error: vi.fn() };
const mockConfirm = { confirm: vi.fn().mockResolvedValue(true) };
const mockAuth = { currentUser: () => ({ role: 'TENANT_ADMIN', id: 'u1', email: 'a@test.com' }) };

const locals = [{ _id: 'local-1', name: 'Local A' }];
const reservations = [
  {
    _id: 'res-1', date: '2026-05-02', turno: '20:00', partySize: 2,
    guestName: 'Ana Torres', guestEmail: 'ana@test.com', status: 'pending' as const,
    confirmationToken: 'tok123', createdAt: new Date().toISOString(),
  },
];
const defaultConfig = {
  enabled: true, turnos: ['12:00', '20:00'], defaultDuration: 90,
  maxPerTurno: 4, maxPartySize: 10, advanceBookingDays: 30,
};

describe('ReservationsComponent', () => {
  let component: ReservationsComponent;
  let httpMock: HttpTestingController;

  function flushInit(resData = reservations, cfgData = defaultConfig) {
    httpMock.expectOne('http://localhost:3000/locals').flush(locals);
    httpMock.expectOne((r) => r.url === 'http://localhost:3000/reservations').flush(resData);
    httpMock.expectOne((r) => r.url === 'http://localhost:3000/reservations/config').flush(cfgData);
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [ReservationsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmService, useValue: mockConfirm },
        { provide: AuthService, useValue: mockAuth },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ReservationsComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushInit();
  });

  afterEach(() => httpMock.verify());

  // ─── init ──────────────────────────────────────────────────────────────────

  it('should create', () => expect(component).toBeTruthy());

  it('should load locals and select first', () => {
    expect(component.locals()).toHaveLength(1);
    expect(component.selectedLocalId()).toBe('local-1');
  });

  it('should load reservations on init', () => {
    expect(component.reservations()).toHaveLength(1);
    expect(component.reservations()[0]._id).toBe('res-1');
  });

  it('should load config on init when admin', () => {
    expect(component.config()?.turnos).toHaveLength(2);
    expect(component.config()?.enabled).toBe(true);
  });

  it('configForm should be populated from config', () => {
    expect(component.configForm.get('defaultDuration')?.value).toBe(90);
    expect(component.configForm.get('maxPartySize')?.value).toBe(10);
  });

  it('turnosList should reflect config turnos', () => {
    expect(component.turnosList()).toEqual(['12:00', '20:00']);
  });

  // ─── canManage ─────────────────────────────────────────────────────────────

  it('canManage should be true for TENANT_ADMIN', () => {
    expect(component.canManage()).toBe(true);
  });

  // ─── navigation ────────────────────────────────────────────────────────────

  it('should switch to config tab on openConfig', () => {
    component.openConfig();
    expect(component.activeTab()).toBe('config');
  });

  it('openConfig does not reload config when already loaded', () => {
    component.openConfig();
    httpMock.expectNone((r) => r.url === 'http://localhost:3000/reservations/config');
  });

  it('openConfig loads config when not yet loaded', () => {
    component.config.set(null);
    component.openConfig();
    const req = httpMock.expectOne((r) => r.url === 'http://localhost:3000/reservations/config');
    req.flush(defaultConfig);
  });

  // ─── onLocalChange ─────────────────────────────────────────────────────────

  it('onLocalChange updates selectedLocalId', () => {
    component.onLocalChange({ target: { value: 'local-2' } } as any);
    expect(component.selectedLocalId()).toBe('local-2');
    expect(component.activeTab()).toBe('list');

    const resReq = httpMock.expectOne((r) => r.url === 'http://localhost:3000/reservations');
    resReq.flush([]);
    const cfgReq = httpMock.expectOne((r) => r.url === 'http://localhost:3000/reservations/config');
    cfgReq.flush(defaultConfig);
  });

  it('onLocalChange with empty value does not reload', () => {
    component.onLocalChange({ target: { value: '' } } as any);
    expect(component.selectedLocalId()).toBe('');
    httpMock.expectNone((r) => r.url === 'http://localhost:3000/reservations');
  });

  // ─── filters ───────────────────────────────────────────────────────────────

  it('onDateChange updates date and reloads', () => {
    component.onDateChange({ target: { value: '2026-06-20' } } as any);
    expect(component.selectedDate()).toBe('2026-06-20');
    const req = httpMock.expectOne((r) => r.url === 'http://localhost:3000/reservations');
    req.flush([]);
  });

  it('onStatusFilter updates filter and reloads', () => {
    component.onStatusFilter({ target: { value: 'confirmed' } } as any);
    expect(component.statusFilter()).toBe('confirmed');
    const req = httpMock.expectOne((r) => r.url === 'http://localhost:3000/reservations');
    req.flush([]);
  });

  it('loadReservations does nothing if no local selected', () => {
    component.selectedLocalId.set('');
    component.loadReservations();
    httpMock.expectNone((r) => r.url === 'http://localhost:3000/reservations');
  });

  // ─── updateStatus ──────────────────────────────────────────────────────────

  it('updateStatus calls PATCH and reloads', () => {
    component.updateStatus(reservations[0] as any, 'confirmed');

    const req = httpMock.expectOne('http://localhost:3000/reservations/res-1/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.status).toBe('confirmed');
    req.flush({});

    expect(mockToast.success).toHaveBeenCalled();
    const reloadReq = httpMock.expectOne((r) => r.url === 'http://localhost:3000/reservations');
    reloadReq.flush([]);
  });

  it('updateStatus shows error toast on failure', () => {
    component.updateStatus(reservations[0] as any, 'confirmed');
    const req = httpMock.expectOne('http://localhost:3000/reservations/res-1/status');
    req.flush({ message: 'Error' }, { status: 400, statusText: 'Bad Request' });
    expect(mockToast.error).toHaveBeenCalled();
  });

  // ─── cancelReservation ─────────────────────────────────────────────────────

  it('cancelReservation cancels after confirmation', async () => {
    await component.cancelReservation(reservations[0] as any);

    const req = httpMock.expectOne('http://localhost:3000/reservations/res-1/status');
    expect(req.request.body.status).toBe('cancelled');
    req.flush({});

    expect(mockToast.success).toHaveBeenCalled();
    const reloadReq = httpMock.expectOne((r) => r.url === 'http://localhost:3000/reservations');
    reloadReq.flush([]);
  });

  it('cancelReservation does nothing when confirmation denied', async () => {
    mockConfirm.confirm.mockResolvedValueOnce(false);
    await component.cancelReservation(reservations[0] as any);
    httpMock.expectNone('http://localhost:3000/reservations/res-1/status');
  });

  // ─── copyConfirmLink ───────────────────────────────────────────────────────

  it('copyConfirmLink copies URL to clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, writable: true, configurable: true });
    component.copyConfirmLink(reservations[0] as any);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('tok123'));
    expect(mockToast.success).toHaveBeenCalled();
  });

  // ─── saveConfig ────────────────────────────────────────────────────────────

  it('saveConfig sends PUT and shows success toast', () => {
    component.activeTab.set('config');
    component.saveConfig();

    const req = httpMock.expectOne('http://localhost:3000/reservations/config');
    expect(req.request.method).toBe('PUT');
    req.flush(defaultConfig);
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('saveConfig shows error toast on failure', () => {
    component.activeTab.set('config');
    component.saveConfig();

    const req = httpMock.expectOne('http://localhost:3000/reservations/config');
    req.flush({ message: 'Error' }, { status: 500, statusText: 'Server Error' });
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('saveConfig does nothing when form is invalid', () => {
    component.configForm.get('defaultDuration')?.setValue(null);
    component.saveConfig();
    httpMock.expectNone('http://localhost:3000/reservations/config');
  });

  // ─── turnos ────────────────────────────────────────────────────────────────

  it('addTurno adds a new turno', () => {
    const input = { value: '22:00' } as HTMLInputElement;
    component.addTurno(input);
    expect(component.turnosList()).toContain('22:00');
    expect(input.value).toBe('');
  });

  it('addTurno does not add duplicate', () => {
    const input = { value: '12:00' } as HTMLInputElement;
    component.addTurno(input);
    expect(component.turnosList().filter((t) => t === '12:00')).toHaveLength(1);
  });

  it('addTurno does nothing when input is empty', () => {
    const before = component.turnosList().length;
    component.addTurno({ value: '' } as HTMLInputElement);
    expect(component.turnosList()).toHaveLength(before);
  });

  it('removeTurno removes the turno at index', () => {
    component.removeTurno(0);
    expect(component.turnosList()).not.toContain('12:00');
  });

  // ─── status / occasion labels ──────────────────────────────────────────────

  it('statusLabel returns correct labels', () => {
    expect(component.statusLabel('pending')).toBe('Pendiente');
    expect(component.statusLabel('confirmed')).toBe('Confirmada');
    expect(component.statusLabel('cancelled')).toBe('Cancelada');
    expect(component.statusLabel('no-show')).toBe('No se presentó');
  });

  it('occasionLabel returns correct labels', () => {
    expect(component.occasionLabel('birthday')).toBe('Cumpleaños');
    expect(component.occasionLabel('unknown')).toBe('unknown');
  });
});

// ─── Non-admin role ────────────────────────────────────────────────────────

describe('ReservationsComponent — HOST role', () => {
  let component: ReservationsComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mockAuthHost = { currentUser: () => ({ role: 'HOST', id: 'u2', email: 'h@test.com' }) };

    await TestBed.configureTestingModule({
      imports: [ReservationsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmService, useValue: mockConfirm },
        { provide: AuthService, useValue: mockAuthHost },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ReservationsComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    // HOST role: only reservations loaded (no config)
    httpMock.expectOne('http://localhost:3000/locals').flush([{ _id: 'local-1', name: 'Local A' }]);
    httpMock.expectOne((r) => r.url === 'http://localhost:3000/reservations').flush([]);
  });

  afterEach(() => httpMock.verify());

  it('canManage should be false for HOST', () => {
    expect(component.canManage()).toBe(false);
  });

  it('should not load config for HOST role', () => {
    httpMock.expectNone((r) => r.url === 'http://localhost:3000/reservations/config');
  });
});
