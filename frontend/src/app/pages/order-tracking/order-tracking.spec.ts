import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { OrderTrackingComponent } from './order-tracking';

const mockRoute = {
  snapshot: { paramMap: { get: () => 'order-abc' } },
};

const mockOrder = {
  _id: 'order-abc',
  tableNumber: '5',
  type: 'dine-in',
  status: 'preparing',
  items: [{ name: 'Pizza', quantity: 1, price: 25, subtotal: 25 }],
  subtotal: 25,
  total: 25,
  statusHistory: [
    { status: 'pending', at: new Date().toISOString() },
    { status: 'preparing', at: new Date().toISOString() },
  ],
  callWaiter: false,
  callBill: false,
  createdAt: new Date().toISOString(),
};

describe('OrderTrackingComponent', () => {
  let component: OrderTrackingComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderTrackingComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(OrderTrackingComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const req = httpMock.expectOne('http://localhost:3000/public/orders/order-abc');
    req.flush(mockOrder);
  });

  afterEach(() => {
    component.ngOnDestroy();
    httpMock.verify();
  });

  it('should create', () => expect(component).toBeTruthy());

  it('should load order on init', () => {
    expect(component.order()).not.toBeNull();
    expect(component.order()!.tableNumber).toBe('5');
    expect(component.loading()).toBe(false);
  });

  it('should compute step indices correctly', () => {
    expect(component.stepIndex('pending')).toBe(0);
    expect(component.stepIndex('preparing')).toBe(1);
    expect(component.stepIndex('ready')).toBe(2);
    expect(component.stepIndex('served')).toBe(3);
    expect(component.stepIndex('cancelled')).toBe(-1);
  });

  it('should compute stepDone correctly', () => {
    expect(component.stepDone('pending')).toBe(true);
    expect(component.stepDone('preparing')).toBe(true);
    expect(component.stepDone('ready')).toBe(false);
    expect(component.stepDone('served')).toBe(false);
  });

  it('should return status config', () => {
    const cfg = component.statusCfg('pending');
    expect(cfg.label).toBe('Recibido');
    expect(cfg.icon).toBe('◉');
  });

  it('should call waiter', () => {
    component.callWaiter();
    const req = httpMock.expectOne('http://localhost:3000/public/orders/order-abc/call-waiter');
    expect(req.request.method).toBe('POST');
    req.flush({});
    expect(component.order()!.callWaiter).toBe(true);
  });

  it('should call bill', () => {
    component.callBill();
    const req = httpMock.expectOne('http://localhost:3000/public/orders/order-abc/call-bill');
    expect(req.request.method).toBe('POST');
    req.flush({});
    expect(component.order()!.callBill).toBe(true);
  });

  it('should handle call waiter error gracefully', () => {
    component.callWaiter();
    const req = httpMock.expectOne('http://localhost:3000/public/orders/order-abc/call-waiter');
    req.flush('error', { status: 500, statusText: 'Server Error' });
    expect(component.callingWaiter()).toBe(false);
  });

  it('should handle call bill error gracefully', () => {
    component.callBill();
    const req = httpMock.expectOne('http://localhost:3000/public/orders/order-abc/call-bill');
    req.flush('error', { status: 500, statusText: 'Server Error' });
    expect(component.callingBill()).toBe(false);
  });

  it('should handle order not found', () => {
    const fixture2 = TestBed.createComponent(OrderTrackingComponent);
    const c2 = fixture2.componentInstance;
    fixture2.detectChanges();

    const req = httpMock.expectOne('http://localhost:3000/public/orders/order-abc');
    req.flush('not found', { status: 404, statusText: 'Not Found' });

    expect(c2.order()).toBeNull();
    expect(c2.loading()).toBe(false);
    c2.ngOnDestroy();
  });

  it('should not call waiter when no order', () => {
    component.order.set(null);
    component.callWaiter();
    httpMock.expectNone((r) => r.url.includes('call-waiter'));
  });

  it('should not call bill when no order', () => {
    component.order.set(null);
    component.callBill();
    httpMock.expectNone((r) => r.url.includes('call-bill'));
  });
});
