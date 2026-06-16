import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { PublicMenuComponent } from './public-menu';

const mockRoute = {
  snapshot: { paramMap: { get: (k: string) => (k === 'localId' ? 'local-1' : '3') } },
};

const mockMenuData = {
  local: { _id: 'local-1', name: 'El Restaurante', type: 'restaurant' },
  categories: [{ _id: 'cat-1', name: 'Entradas', sortOrder: 0 }],
  items: [
    {
      _id: 'item-1', categoryId: 'cat-1', name: 'Pizza', description: 'Desc',
      price: 25, photos: [], variants: [], modifiers: [],
      allergens: ['gluten'], dietaryTags: ['vegetarian'], stations: ['kitchen'], isAvailable: true,
    },
    {
      _id: 'item-2', categoryId: 'cat-1', name: 'Beer', price: 12,
      photos: ['http://img.test/beer.jpg'], variants: [], modifiers: [],
      allergens: [], dietaryTags: [], stations: ['bar'], isAvailable: false,
    },
  ],
};

describe('PublicMenuComponent', () => {
  let component: PublicMenuComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicMenuComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PublicMenuComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url.includes('/public/menu'));
    req.flush(mockMenuData);
  });

  afterEach(() => httpMock.verify());

  it('should create', () => expect(component).toBeTruthy());

  it('should load menu data on init', () => {
    expect(component.local()?.name).toBe('El Restaurante');
    expect(component.categories()).toHaveLength(1);
    expect(component.items()).toHaveLength(2);
    expect(component.activeCatId()).toBe('cat-1');
    expect(component.tableNumber()).toBe('3');
  });

  it('should filter items by active category', () => {
    expect(component.filteredItems()).toHaveLength(2);
    component.activeCatId.set('other-cat');
    expect(component.filteredItems()).toHaveLength(0);
  });

  it('should add item to cart', () => {
    component.addToCart(mockMenuData.items[0] as any);
    expect(component.cart()).toHaveLength(1);
    expect(component.cart()[0].quantity).toBe(1);
    expect(component.cart()[0].subtotal).toBe(25);
  });

  it('should increment quantity when adding same item twice', () => {
    component.addToCart(mockMenuData.items[0] as any);
    component.addToCart(mockMenuData.items[0] as any);
    expect(component.cart()).toHaveLength(1);
    expect(component.cart()[0].quantity).toBe(2);
    expect(component.cart()[0].subtotal).toBe(50);
  });

  it('should compute cart count and total', () => {
    component.addToCart(mockMenuData.items[0] as any);
    component.addToCart(mockMenuData.items[0] as any);
    expect(component.cartCount()).toBe(2);
    expect(component.cartTotal()).toBe(50);
  });

  it('should increase quantity', () => {
    component.addToCart(mockMenuData.items[0] as any);
    const ci = component.cart()[0];
    component.increaseQty(ci);
    expect(component.cart()[0].quantity).toBe(2);
  });

  it('should decrease quantity', () => {
    component.addToCart(mockMenuData.items[0] as any);
    component.addToCart(mockMenuData.items[0] as any);
    const ci = component.cart()[0];
    component.decreaseQty(ci);
    expect(component.cart()[0].quantity).toBe(1);
  });

  it('should remove item when quantity reaches zero', () => {
    component.addToCart(mockMenuData.items[0] as any);
    const ci = component.cart()[0];
    component.decreaseQty(ci);
    expect(component.cart()).toHaveLength(0);
  });

  it('should set item notes', () => {
    component.addToCart(mockMenuData.items[0] as any);
    const ci = component.cart()[0];
    component.setNotes(ci, { target: { value: 'sin cebolla' } } as any);
    expect(component.cart()[0].notes).toBe('sin cebolla');
  });

  it('should submit order and set orderId', () => {
    component.addToCart(mockMenuData.items[0] as any);
    component.submitOrder();

    const req = httpMock.expectOne('http://localhost:3000/public/orders');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.tableNumber).toBe('3');
    req.flush({ _id: 'new-order-id' });

    expect(component.orderId()).toBe('new-order-id');
    expect(component.cart()).toHaveLength(0);
  });

  it('should not submit empty cart', () => {
    component.submitOrder();
    httpMock.expectNone('http://localhost:3000/public/orders');
  });

  it('should return correct diet icons', () => {
    expect(component.dietIcon('vegetarian')).toBe('🌿');
    expect(component.dietIcon('vegan')).toBe('🌱');
    expect(component.dietIcon('unknown')).toBe('•');
  });

  it('should handle menu load error', () => {
    const fixture2 = TestBed.createComponent(PublicMenuComponent);
    const c2 = fixture2.componentInstance;
    fixture2.detectChanges();

    const req2 = httpMock.expectOne((r) => r.url.includes('/public/menu'));
    req2.flush('error', { status: 404, statusText: 'Not Found' });

    expect(c2.error()).toBe('No se pudo cargar la carta.');
    expect(c2.loading()).toBe(false);
  });

  it('should show error when no localId', () => {
    const fixture3 = TestBed.createComponent(PublicMenuComponent);
    const c3 = fixture3.componentInstance;
    c3.localId = '';
    c3.loadMenu();
    expect(c3.error()).toBe('Local no especificado');
    expect(c3.loading()).toBe(false);
  });
});
