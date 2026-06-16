import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { KdsComponent } from './kds';
import { ToastService } from '../../shared/toast';
import { AuthService } from '../../auth/auth.service';

const mockToast = { success: vi.fn(), error: vi.fn() };

const locals = [{ _id: 'local-1', name: 'Local A' }];

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'ord-1', tableNumber: '2', type: 'dine-in', status: 'pending',
    items: [{ itemId: 'i1', name: 'Pizza', price: 25, quantity: 1, subtotal: 25, stations: ['kitchen'] }],
    total: 25, callWaiter: false, callBill: false, createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function setupWithRole(role: string) {
  // No tenantId → connectWs() returns early without calling io()
  const mockAuth = { currentUser: () => ({ role, id: 'u1', email: 'k@test.com' }) };

  await TestBed.configureTestingModule({
    imports: [KdsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ToastService, useValue: mockToast },
      { provide: AuthService, useValue: mockAuth },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(KdsComponent);
  const component = fixture.componentInstance;
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { component, httpMock };
}

function flushInit(httpMock: HttpTestingController, orders: unknown[] = []) {
  httpMock.expectOne('http://localhost:3000/locals').flush(locals);
  httpMock.expectOne((r) => r.url === 'http://localhost:3000/orders' && r.params.has('localId')).flush(orders);
}

// ─── KITCHEN role tests ────────────────────────────────────────────────────

describe('KdsComponent — KITCHEN role', () => {
  let component: KdsComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ component, httpMock } = await setupWithRole('KITCHEN'));
    flushInit(httpMock, [makeOrder()]);
  });

  afterEach(() => httpMock.verify());

  it('should create', () => expect(component).toBeTruthy());

  it('should load locals and select first', () => {
    expect(component.locals()).toHaveLength(1);
    expect(component.selectedLocalId()).toBe('local-1');
  });

  it('should load orders', () => {
    expect(component.orders()).toHaveLength(1);
  });

  it('stationLabel should be Cocina', () => {
    expect(component.stationLabel()).toBe('Cocina');
  });

  it('filteredOrders shows only pending and preparing', () => {
    component.orders.set([
      makeOrder({ _id: 'o1', status: 'pending' }),
      makeOrder({ _id: 'o2', status: 'preparing' }),
      makeOrder({ _id: 'o3', status: 'ready' }),
      makeOrder({ _id: 'o4', status: 'served' }),
    ] as any);
    expect(component.filteredOrders()).toHaveLength(2);
  });

  it('filteredOrders filters to kitchen items only', () => {
    component.orders.set([
      makeOrder({ _id: 'o1', items: [{ itemId: 'i1', name: 'Pizza', price: 10, quantity: 1, subtotal: 10, stations: ['kitchen'] }] }),
      makeOrder({ _id: 'o2', items: [{ itemId: 'i2', name: 'Beer', price: 10, quantity: 1, subtotal: 10, stations: ['bar'] }] }),
    ] as any);
    expect(component.filteredOrders()).toHaveLength(1);
    expect(component.filteredOrders()[0]._id).toBe('o1');
  });

  it('filteredOrders sorts oldest first', () => {
    const now = Date.now();
    component.orders.set([
      makeOrder({ _id: 'new', createdAt: new Date(now).toISOString() }),
      makeOrder({ _id: 'old', createdAt: new Date(now - 10 * 60 * 1000).toISOString() }),
    ] as any);
    const filtered = component.filteredOrders();
    expect(filtered[0]._id).toBe('old');
    expect(filtered[1]._id).toBe('new');
  });

  it('isOverdue returns true if older than 15 min', () => {
    const old = makeOrder({ createdAt: new Date(Date.now() - 16 * 60 * 1000).toISOString() });
    expect(component.isOverdue(old as any)).toBe(true);
  });

  it('isOverdue returns false for recent order', () => {
    const fresh = makeOrder({ createdAt: new Date().toISOString() });
    expect(component.isOverdue(fresh as any)).toBe(false);
  });

  it('elapsedLabel returns < 1 min for very recent order', () => {
    expect(component.elapsedLabel(new Date().toISOString())).toBe('< 1 min');
  });

  it('elapsedLabel returns minutes elapsed', () => {
    const ts = new Date(Date.now() - 7 * 60 * 1000).toISOString();
    expect(component.elapsedLabel(ts)).toBe('7 min');
  });

  it('nextStatus: pending → preparing', () => expect(component.nextStatus('pending')).toBe('preparing'));
  it('nextStatus: preparing → ready', () => expect(component.nextStatus('preparing')).toBe('ready'));
  it('nextStatus: ready → null', () => expect(component.nextStatus('ready')).toBeNull());

  it('nextLabel: pending → Preparando', () => expect(component.nextLabel('pending')).toBe('Preparando'));
  it('nextLabel: preparing → Listo', () => expect(component.nextLabel('preparing')).toBe('Listo'));

  it('stationItems returns only kitchen items', () => {
    const order = makeOrder({
      items: [
        { itemId: 'i1', name: 'Pizza', price: 10, quantity: 1, subtotal: 10, stations: ['kitchen'] },
        { itemId: 'i2', name: 'Beer', price: 10, quantity: 1, subtotal: 10, stations: ['bar'] },
      ],
    });
    const items = component.stationItems(order as any);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Pizza');
  });

  it('typeLabel returns correct labels', () => {
    expect(component.typeLabel('dine-in')).toBe('Mesa');
    expect(component.typeLabel('delivery')).toBe('Delivery');
    expect(component.typeLabel('takeaway')).toBe('Para llevar');
  });

  it('advance calls PATCH and shows success toast', () => {
    component.advance(component.orders()[0] as any);
    const req = httpMock.expectOne('http://localhost:3000/orders/ord-1/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.status).toBe('preparing');
    req.flush({});
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('advance shows error toast on failure', () => {
    component.advance(component.orders()[0] as any);
    const req = httpMock.expectOne('http://localhost:3000/orders/ord-1/status');
    req.flush('error', { status: 500, statusText: 'Server Error' });
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('advance does nothing when no next status', () => {
    const served = makeOrder({ status: 'served' });
    component.advance(served as any);
    httpMock.expectNone((r) => r.url.includes('/status'));
  });

  it('onLocalChange updates selectedLocalId and reloads', () => {
    component.onLocalChange({ target: { value: 'local-2' } } as any);
    expect(component.selectedLocalId()).toBe('local-2');
    const req = httpMock.expectOne((r) => r.url === 'http://localhost:3000/orders' && r.params.get('localId') === 'local-2');
    req.flush([]);
  });
});

// ─── General role tests ────────────────────────────────────────────────────

describe('KdsComponent — TENANT_ADMIN (General) role', () => {
  let component: KdsComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ component, httpMock } = await setupWithRole('TENANT_ADMIN'));
    flushInit(httpMock);
  });

  afterEach(() => httpMock.verify());

  it('stationLabel should be General', () => {
    expect(component.stationLabel()).toBe('General');
  });

  it('stationItems returns all items for General role', () => {
    const order = makeOrder({
      items: [
        { itemId: 'i1', name: 'Pizza', price: 10, quantity: 1, subtotal: 10, stations: ['kitchen'] },
        { itemId: 'i2', name: 'Beer', price: 10, quantity: 1, subtotal: 10, stations: ['bar'] },
      ],
    });
    expect(component.stationItems(order as any)).toHaveLength(2);
  });

  it('filteredOrders shows all stations for General role', () => {
    component.orders.set([
      makeOrder({ _id: 'o1', items: [{ itemId: 'i1', name: 'Pizza', price: 10, quantity: 1, subtotal: 10, stations: ['kitchen'] }] }),
      makeOrder({ _id: 'o2', items: [{ itemId: 'i2', name: 'Beer', price: 10, quantity: 1, subtotal: 10, stations: ['bar'] }] }),
    ] as any);
    expect(component.filteredOrders()).toHaveLength(2);
  });
});

// ─── BAR role tests ────────────────────────────────────────────────────────

describe('KdsComponent — BAR role', () => {
  let component: KdsComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ component, httpMock } = await setupWithRole('BAR'));
    flushInit(httpMock);
  });

  afterEach(() => httpMock.verify());

  it('stationLabel should be Bar', () => {
    expect(component.stationLabel()).toBe('Bar');
  });

  it('filteredOrders filters to bar items only', () => {
    component.orders.set([
      makeOrder({ _id: 'o1', items: [{ itemId: 'i1', name: 'Pizza', price: 10, quantity: 1, subtotal: 10, stations: ['kitchen'] }] }),
      makeOrder({ _id: 'o2', items: [{ itemId: 'i2', name: 'Beer', price: 10, quantity: 1, subtotal: 10, stations: ['bar'] }] }),
    ] as any);
    expect(component.filteredOrders()).toHaveLength(1);
    expect(component.filteredOrders()[0]._id).toBe('o2');
  });
});

// ─── Error / edge cases ────────────────────────────────────────────────────

describe('KdsComponent — edge cases', () => {
  let component: KdsComponent;
  let httpMock: HttpTestingController;

  afterEach(() => httpMock?.verify());

  it('handles empty locals list', async () => {
    vi.clearAllMocks();
    ({ component, httpMock } = await setupWithRole('KITCHEN'));
    httpMock.expectOne('http://localhost:3000/locals').flush([]);
    expect(component.loading()).toBe(false);
    expect(component.selectedLocalId()).toBe('');
  });

  it('handles loadLocals error', async () => {
    vi.clearAllMocks();
    ({ component, httpMock } = await setupWithRole('KITCHEN'));
    httpMock.expectOne('http://localhost:3000/locals').flush('error', { status: 500, statusText: 'Server Error' });
    expect(component.loading()).toBe(false);
  });
});
