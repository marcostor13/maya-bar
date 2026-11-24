import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProductsSettingsComponent } from './products-settings';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/products`;
const P = { _id: 'p1', name: 'Hora de consultoría', price: 150, taxIncluded: false, unit: 'hora', active: true, source: 'manual' };

describe('Catálogo de productos (HU68)', () => {
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };
  let http: HttpTestingController;

  async function setup() {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ProductsSettingsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }, { provide: ConfirmService, useValue: confirm }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(ProductsSettingsComponent);
    f.detectChanges();
    http.expectOne(`${API}?all=1`).flush([P]);
    f.detectChanges();
    return f;
  }
  afterEach(() => http.verify());

  it('lista, crea con el modal e importa de WooCommerce', async () => {
    const f = await setup();
    const c = f.componentInstance;
    expect((f.nativeElement as HTMLElement).textContent).toContain('Hora de consultoría');

    c.openNew();
    c.form.name = '  Licencia ';
    c.form.price = 99;
    c.save();
    const req = http.expectOne(API);
    expect(req.request.body).toEqual({ name: 'Licencia', price: 99, taxIncluded: true, unit: 'unidad', active: true });
    req.flush({ ...P, _id: 'p2' });
    http.expectOne(`${API}?all=1`).flush([P]);
    expect(toast.success).toHaveBeenCalledWith('Producto creado');
    expect(c.editing()).toBeNull();

    c.storeUrl = 'https://tienda.pe';
    c.importWoo();
    const imp = http.expectOne(`${API}/import-woocommerce`);
    expect(imp.request.body).toEqual({ storeUrl: 'https://tienda.pe' });
    imp.flush({ total: 12, created: 10, updated: 2 });
    http.expectOne(`${API}?all=1`).flush([P]);
    expect(toast.success).toHaveBeenCalledWith('Importados 12 productos (10 nuevos, 2 actualizados)');
  });

  it('eliminar pide confirmación', async () => {
    const f = await setup();
    confirm.confirm.mockResolvedValueOnce(false);
    await f.componentInstance.remove(P as never);
    http.expectNone(`${API}/p1`);
  });
});
