import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { OrdersComponent } from './orders';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const mockToast = { success: vi.fn(), error: vi.fn() };
const mockConfirm = { confirm: vi.fn().mockResolvedValue(true) };

describe('OrdersComponent', () => {
  let component: OrdersComponent;
  let httpMock: HttpTestingController;

  const locals = [{ _id: 'local-1', name: 'Local A', tableCount: 3 }];
  const orders = [
    {
      _id: 'ord-1', tableNumber: '2', type: 'dine-in', status: 'pending' as const,
      items: [{ name: 'Pizza', quantity: 1, price: 25, subtotal: 25 }],
      subtotal: 25, total: 25, callWaiter: false, callBill: false, createdAt: new Date().toISOString(),
    },
  ];

  function flushInit() {
    const localsReq = httpMock.expectOne('http://localhost:3000/locals');
    localsReq.flush(locals);
    const ordersReq = httpMock.expectOne((r) => r.url === 'http://localhost:3000/orders' && r.params.has('localId'));
    ordersReq.flush(orders);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmService, useValue: mockConfirm },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(OrdersComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    fixture.detectChanges(); // triggers ngOnInit
    flushInit();
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load locals and select first one', () => {
    expect(component.locals()).toHaveLength(1);
    expect(component.selectedLocalId()).toBe('local-1');
  });

  it('should load orders for selected local', () => {
    expect(component.orders()).toHaveLength(1);
    expect(component.orders()[0]._id).toBe('ord-1');
  });

  it('should filter orders by active tab', () => {
    component.activeTab.set('pending');
    expect(component.filteredOrders()).toHaveLength(1);
    component.activeTab.set('preparing');
    expect(component.filteredOrders()).toHaveLength(0);
    component.activeTab.set('all');
    expect(component.filteredOrders()).toHaveLength(1);
  });

  it('should return correct status labels', () => {
    expect(component.statusLabel('pending')).toBe('Pendiente');
    expect(component.statusLabel('preparing')).toBe('En preparación');
    expect(component.statusLabel('ready')).toBe('Listo');
    expect(component.statusLabel('served')).toBe('Servido');
    expect(component.statusLabel('cancelled')).toBe('Cancelado');
  });

  it('should return next status correctly', () => {
    expect(component.nextStatus('pending')).toBe('preparing');
    expect(component.nextStatus('preparing')).toBe('ready');
    expect(component.nextStatus('ready')).toBe('served');
    expect(component.nextStatus('served')).toBeUndefined();
    expect(component.nextStatus('cancelled')).toBeUndefined();
  });

  it('should count orders by status', () => {
    expect(component.countByStatus('pending')).toBe(1);
    expect(component.countByStatus('preparing')).toBe(0);
    expect(component.countByStatus('all')).toBe(0);
  });

  it('should advance order status', () => {
    component.advance(orders[0] as any);

    const req = httpMock.expectOne(`http://localhost:3000/orders/ord-1/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.status).toBe('preparing');
    req.flush({});

    expect(mockToast.success).toHaveBeenCalled();
  });

  it('should cancel order after confirmation', async () => {
    await component.cancel(orders[0] as any);

    const req = httpMock.expectOne(`http://localhost:3000/orders/ord-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});

    expect(mockToast.success).toHaveBeenCalled();
  });

  it('should not cancel if confirmation denied', async () => {
    mockConfirm.confirm.mockResolvedValueOnce(false);
    await component.cancel(orders[0] as any);
    httpMock.expectNone(`http://localhost:3000/orders/ord-1`);
  });

  it('should handle local change', () => {
    component.onLocalChange({ target: { value: 'local-2' } } as any);
    expect(component.selectedLocalId()).toBe('local-2');

    const req = httpMock.expectOne((r) => r.url === 'http://localhost:3000/orders' && r.params.get('localId') === 'local-2');
    req.flush([]);
  });

  it('should toggle QR tab and load tables on first open', () => {
    component.toggleQrTab();
    expect(component.showQrTab()).toBe(true);

    const req = httpMock.expectOne((r) => r.url === 'http://localhost:3000/orders/tables' && r.params.has('localId'));
    req.flush([{ number: 1, name: 'Mesa 1', qrUrl: 'http://test/q/local-1/1' }]);
  });

  it('should not reload tables when toggling back to QR tab if already loaded', () => {
    component.tables.set([{ number: 1, name: 'Mesa 1', qrUrl: 'http://test' }]);
    component.showQrTab.set(false);
    component.toggleQrTab();
    httpMock.expectNone((r) => r.url.includes('/orders/tables'));
    expect(component.showQrTab()).toBe(true);
  });

  it('should toggle QR tab off', () => {
    component.showQrTab.set(true);
    component.tables.set([{ number: 1, name: 'Mesa 1', qrUrl: 'http://test' }]);
    component.toggleQrTab();
    expect(component.showQrTab()).toBe(false);
  });

  it('should handle advance error', () => {
    component.advance(orders[0] as any);
    const req = httpMock.expectOne(`http://localhost:3000/orders/ord-1/status`);
    req.flush('error', { status: 500, statusText: 'Server Error' });
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('should handle cancel error', async () => {
    await component.cancel(orders[0] as any);
    const req = httpMock.expectOne(`http://localhost:3000/orders/ord-1`);
    req.flush('error', { status: 500, statusText: 'Server Error' });
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('should copy URL to clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, writable: true, configurable: true });
    component.copyUrl('http://test-url');
    expect(writeText).toHaveBeenCalledWith('http://test-url');
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('should call printQrs', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    component.printQrs();
    expect(printSpy).toHaveBeenCalled();
  });

  it('should handle loadTables error', () => {
    component.loadTablesForLocal();
    const req = httpMock.expectOne((r) => r.url === 'http://localhost:3000/orders/tables' && r.params.has('localId'));
    req.flush('error', { status: 500, statusText: 'Server Error' });
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('should not load orders when no local selected', () => {
    component.selectedLocalId.set('');
    component.loadOrders();
    httpMock.expectNone((r) => r.url === 'http://localhost:3000/orders');
  });

  it('should handle empty locals list', () => {
    vi.clearAllMocks();

    const fixture2 = TestBed.createComponent(OrdersComponent);
    const c2 = fixture2.componentInstance;
    fixture2.detectChanges();

    const req = httpMock.expectOne('http://localhost:3000/locals');
    req.flush([]);

    expect(c2.loading()).toBe(false);
    expect(c2.selectedLocalId()).toBe('');
  });

  it('should handle loadLocals error', () => {
    const fixture3 = TestBed.createComponent(OrdersComponent);
    const c3 = fixture3.componentInstance;
    fixture3.detectChanges();

    const req = httpMock.expectOne('http://localhost:3000/locals');
    req.flush('error', { status: 500, statusText: 'Server Error' });

    expect(c3.loading()).toBe(false);
  });
});
