import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { RegisterComponent } from './register';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';

const DATA: Record<string, string> = {
  name: 'La Mar S.A.C.', ruc: '20123456789', phone: '+51 999 999 999',
  email: 'contacto@lamar.pe', ownerName: 'Juan Pérez', ownerPassword: 'clave-segura',
};

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let http: HttpTestingController;
  let router: Router;

  const el = () => fixture.nativeElement as HTMLElement;
  const submitBtn = () => el().querySelector('button[type="submit"]') as HTMLButtonElement;
  const fill = (values: Record<string, string>) => {
    for (const [name, value] of Object.entries(values)) {
      const input = el().querySelector(`input[formControlName="${name}"]`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
  };
  const submit = () => {
    el().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
  });

  afterEach(() => { http.verify(); localStorage.clear(); });

  it('no deja enviar sin los obligatorios, con email inválido o contraseña corta', () => {
    expect(submitBtn().disabled).toBe(true);
    fill({ ...DATA, ownerPassword: '1234567' });
    expect(submitBtn().disabled).toBe(true);
    fill({ ownerPassword: 'clave-segura', email: 'no-es-email' });
    expect(submitBtn().disabled).toBe(true);
    submit();
    http.expectNone((r) => r.url.endsWith('/auth/register'));
    fill({ email: DATA['email'] });
    expect(submitBtn().disabled).toBe(false);
  });

  it('RUC y teléfono son opcionales', () => {
    fill({ ...DATA, ruc: '', phone: '' });
    expect(submitBtn().disabled).toBe(false);
  });

  it('manda POST /auth/register con los seis campos, guarda la sesión y va al onboarding', () => {
    fill(DATA);
    submit();
    expect(submitBtn().disabled).toBe(true);
    expect(submitBtn().textContent).toContain('Creando cuenta...');

    const req = http.expectOne((r) => r.url.endsWith('/auth/register'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(DATA);
    req.flush({ access_token: 'tok', refresh_token: 'ref', user: { id: 'u1', email: DATA['email'], role: 'TENANT_ADMIN' } });

    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith(['/onboarding']);
  });

  it('si el servidor rechaza el alta muestra su mensaje y deja reintentar', () => {
    fill(DATA);
    submit();
    http.expectOne((r) => r.url.endsWith('/auth/register'))
      .flush({ message: 'El email ya está registrado' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(el().querySelector('.alert-error')!.textContent).toContain('El email ya está registrado');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(submitBtn().disabled).toBe(false);
    expect(submitBtn().textContent).toContain('Crear cuenta gratis');
  });

  it('sin mensaje del servidor usa el texto por defecto', () => {
    fill(DATA);
    submit();
    http.expectOne((r) => r.url.endsWith('/auth/register')).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el().querySelector('.alert-error')!.textContent).toContain('Error al crear la cuenta');
  });
});
