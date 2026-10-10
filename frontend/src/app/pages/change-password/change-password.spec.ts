import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { ChangePasswordComponent } from './change-password';
import { AuthService } from '../../auth/auth.service';

describe('ChangePasswordComponent', () => {
  let fixture: ComponentFixture<ChangePasswordComponent>;
  let http: HttpTestingController;
  let router: Router;
  const auth = { updateSession: vi.fn() };

  const el = () => fixture.nativeElement as HTMLElement;
  const input = (name: string) => el().querySelector(`input[name="${name}"]`) as HTMLInputElement;
  const submitBtn = () => el().querySelector('button[type="submit"]') as HTMLButtonElement;
  const fill = (current: string, next: string, confirm: string) => {
    const values: Record<string, string> = { currentPassword: current, newPassword: next, confirm };
    for (const [name, value] of Object.entries(values)) {
      input(name).value = value;
      input(name).dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
  };
  const submit = () => {
    el().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  };
  const expectChange = () => http.expectOne((r) => r.url.endsWith('/auth/change-password'));

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ChangePasswordComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ChangePasswordComponent);
    fixture.detectChanges();
    // ngModel registra sus controles en una microtarea.
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('el botón queda deshabilitado hasta completar los tres campos con 8+ caracteres', () => {
    expect(submitBtn().disabled).toBe(true);
    fill('temporal', 'corta', 'corta');
    expect(submitBtn().disabled).toBe(true);
    fill('temporal', 'nueva-clave', 'nueva-clave');
    expect(submitBtn().disabled).toBe(false);
  });

  it('si las contraseñas no coinciden lo avisa y no manda nada', () => {
    fill('temporal', 'nueva-clave', 'otra-clave');
    submit();
    expect(el().querySelector('.form-error')!.textContent).toContain('Las contraseñas no coinciden');
    http.expectNone((r) => r.url.endsWith('/auth/change-password'));
  });

  it('si la nueva tiene menos de 8 caracteres lo avisa y no manda nada', () => {
    fill('temporal', 'corta', 'corta');
    submit();
    expect(el().querySelector('.form-error')!.textContent).toContain('al menos 8 caracteres');
    http.expectNone((r) => r.url.endsWith('/auth/change-password'));
  });

  it('manda PATCH /auth/change-password solo con la actual y la nueva, actualiza la sesión y va al panel', () => {
    fill('temporal', 'nueva-clave', 'nueva-clave');
    submit();
    expect(submitBtn().disabled).toBe(true);
    expect(submitBtn().textContent).toContain('Guardando');

    const req = expectChange();
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ currentPassword: 'temporal', newPassword: 'nueva-clave' });
    const res = { access_token: 'nuevo', user: { id: 'u1', email: 'a@x.pe', role: 'MANAGER', mustChangePassword: false } };
    req.flush(res);

    expect(auth.updateSession).toHaveBeenCalledWith(res);
    expect(router.navigate).toHaveBeenCalledWith(['/inicio']);
  });

  it('el SUPERADMIN vuelve a /admin/tenants', () => {
    fill('temporal', 'nueva-clave', 'nueva-clave');
    submit();
    expectChange().flush({ access_token: 'nuevo', user: { id: 'u0', email: 's@x.pe', role: 'SUPERADMIN' } });
    expect(router.navigate).toHaveBeenCalledWith(['/admin/tenants']);
  });

  it('si el servidor rechaza el cambio muestra su mensaje y deja reintentar', () => {
    fill('mala', 'nueva-clave', 'nueva-clave');
    submit();
    expectChange().flush({ message: 'La contraseña actual no es correcta' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(el().querySelector('.form-error')!.textContent).toContain('La contraseña actual no es correcta');
    expect(auth.updateSession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(submitBtn().disabled).toBe(false);
  });

  it('sin mensaje del servidor usa el texto por defecto, y se limpia al reintentar', () => {
    fill('temporal', 'nueva-clave', 'nueva-clave');
    submit();
    expectChange().flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el().querySelector('.form-error')!.textContent).toContain('Error al cambiar la contraseña');
    submit();
    expect(el().querySelector('.form-error')).toBeNull();
    expectChange().flush({ access_token: 'n', user: { role: 'MANAGER' } });
  });

  it('los ojos muestran y ocultan cada contraseña por separado', () => {
    const eyes = el().querySelectorAll<HTMLButtonElement>('.eye-btn');
    eyes[0].click();
    fixture.detectChanges();
    expect(input('currentPassword').type).toBe('text');
    expect(input('newPassword').type).toBe('password');
    eyes[1].click();
    fixture.detectChanges();
    expect(input('newPassword').type).toBe('text');
  });
});
