import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MenuComponent } from './menu';
import { ToastService } from '../../shared/toast';

describe('MenuComponent (formularios a pantalla completa)', () => {
  let fixture: ComponentFixture<MenuComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MenuComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/locals')).flush([]);
  });
  afterEach(() => http.verify());

  it('abre la categoría en app-form-page y guarda desde la cabecera', () => {
    const c = fixture.componentInstance;
    c.openCategoryForm(null);
    fixture.detectChanges();
    expect(el().querySelector('app-form-page h1')?.textContent).toContain('Nueva categoría');
    expect(el().querySelector('.drawer')).toBeNull();
    expect(c.isCategoryDirty()).toBe(false);
    c.categoryForm.patchValue({ name: 'Entradas' });
    expect(c.isCategoryDirty()).toBe(true);
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.bar-actions button[type="submit"]')!.click();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/menu/categories'));
    expect(req.request.body).toMatchObject({ name: 'Entradas' });
    req.flush({});
    http.expectOne((r) => r.url.includes('/menu/categories?')).flush([]);
    expect(toast.success).toHaveBeenCalledWith('Categoría creada');
    expect(c.showCategoryForm()).toBe(false);
  });

  it('el ítem cuenta las estaciones y etiquetas como cambios sin guardar', () => {
    const c = fixture.componentInstance;
    c.openItemForm(null);
    fixture.detectChanges();
    expect(el().querySelector('app-form-page h1')?.textContent).toContain('Nuevo ítem');
    expect(c.isItemDirty()).toBe(false);
    c.toggleStation('bar');
    expect(c.isItemDirty()).toBe(true);
  });
});
