import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LocalsComponent } from './locals';
import { ToastService } from '../../shared/toast';

describe('LocalsComponent (formulario a pantalla completa)', () => {
  let fixture: ComponentFixture<LocalsComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [LocalsComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LocalsComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/locals')).flush([]);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('abre el alta en app-form-page y detecta cambios sin guardar', () => {
    fixture.componentInstance.openForm(null);
    fixture.detectChanges();
    expect(el().querySelector('app-form-page [role="dialog"]')).not.toBeNull();
    expect(el().querySelector('app-form-page h1')?.textContent).toContain('Nuevo local');
    expect(el().querySelector('.drawer')).toBeNull();
    expect(fixture.componentInstance.isDirty()).toBe(false);
    fixture.componentInstance.localForm.patchValue({ name: 'Sede Centro' });
    expect(fixture.componentInstance.isDirty()).toBe(true);
  });

  it('el botón de la cabecera envía el formulario', () => {
    const c = fixture.componentInstance;
    c.openForm(null);
    c.localForm.patchValue({ name: 'Sede Centro' });
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.bar-actions button[type="submit"]')!.click();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/locals'));
    expect(req.request.body).toMatchObject({ name: 'Sede Centro' });
    req.flush({});
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/locals')).flush([]);
    expect(toast.success).toHaveBeenCalledWith('Local creado');
    expect(c.showForm()).toBe(false);
  });
});
