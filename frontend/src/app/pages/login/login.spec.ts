import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { LoginComponent } from './login';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let http: HttpTestingController;
  let router: Router;
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };

  const el = () => fixture.nativeElement as HTMLElement;
  const inputs = () => Array.from(el().querySelectorAll<HTMLInputElement>('input'));
  const submitBtn = () => el().querySelector('button[type="submit"]') as HTMLButtonElement;
  const button = (text: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes(text))!;
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = () => {
    el().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  };
  const fillLogin = (email = 'ana@x.pe', password = 'secreta1') => {
    type(inputs()[0], email);
    type(inputs()[1], password);
  };
  const loginAs = (user: Record<string, unknown>) => {
    fillLogin();
    submit();
    const req = http.expectOne((r) => r.url.endsWith('/auth/login'));
    req.flush({ access_token: 'tok', refresh_token: 'ref', user: { id: 'u1', email: 'ana@x.pe', ...user } });
    return req;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
  });

  afterEach(() => { http.verify(); localStorage.clear(); });

  describe('entrar', () => {
    it('no deja enviar con el formulario vacío o un email mal escrito', () => {
      expect(submitBtn().disabled).toBe(true);
      fillLogin('no-es-email', 'x');
      expect(submitBtn().disabled).toBe(true);
      submit();
      http.expectNone((r) => r.url.endsWith('/auth/login'));
      fillLogin();
      expect(submitBtn().disabled).toBe(false);
    });

    it('manda POST /auth/login con email y contraseña, guarda la sesión y va al panel', () => {
      const req = loginAs({ role: 'TENANT_ADMIN' });
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'ana@x.pe', password: 'secreta1' });
      expect(TestBed.inject(AuthService).getToken()).toBe('tok');
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('el SUPERADMIN entra a /admin/tenants', () => {
      loginAs({ role: 'SUPERADMIN' });
      expect(router.navigate).toHaveBeenCalledWith(['/admin/tenants']);
    });

    it('el IMPULSADOR entra a /impulsador', () => {
      loginAs({ role: 'IMPULSADOR' });
      expect(router.navigate).toHaveBeenCalledWith(['/impulsador']);
    });

    it('con contraseña temporal va a /change-password sea cual sea el rol', () => {
      loginAs({ role: 'SUPERADMIN', mustChangePassword: true });
      expect(router.navigate).toHaveBeenCalledWith(['/change-password']);
    });

    it('mientras responde el servidor el botón queda deshabilitado y lo dice', () => {
      fillLogin();
      submit();
      expect(submitBtn().disabled).toBe(true);
      expect(submitBtn().textContent).toContain('Ingresando...');
      http.expectOne((r) => r.url.endsWith('/auth/login')).flush({ access_token: 't', user: { id: 'u', email: 'a', role: 'MANAGER' } });
    });

    it('con credenciales malas muestra el mensaje, no navega y deja reintentar', () => {
      fillLogin();
      submit();
      http.expectOne((r) => r.url.endsWith('/auth/login'))
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();
      expect(el().querySelector('.alert-error')!.textContent).toContain('Credenciales incorrectas');
      expect(router.navigate).not.toHaveBeenCalled();
      expect(submitBtn().disabled).toBe(false);
      expect(submitBtn().textContent).toContain('Ingresar');
      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
    });

    it('el mensaje de error se limpia al reintentar', () => {
      fillLogin();
      submit();
      http.expectOne((r) => r.url.endsWith('/auth/login')).flush(null, { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();
      submit();
      expect(el().querySelector('.alert-error')).toBeNull();
      http.expectOne((r) => r.url.endsWith('/auth/login')).flush({ access_token: 't', user: { id: 'u', email: 'a', role: 'MANAGER' } });
    });

    it('el ojo alterna entre ocultar y mostrar la contraseña', () => {
      const eye = el().querySelector('.eye-btn') as HTMLButtonElement;
      expect(inputs()[1].type).toBe('password');
      expect(eye.getAttribute('aria-label')).toBe('Mostrar contraseña');
      eye.click();
      fixture.detectChanges();
      expect(inputs()[1].type).toBe('text');
      expect(eye.getAttribute('aria-label')).toBe('Ocultar contraseña');
    });
  });

  describe('recuperar contraseña', () => {
    const goForgot = (email = 'ana@x.pe') => {
      button('¿Olvidaste tu contraseña?').click();
      fixture.detectChanges();
      if (email) type(inputs()[0], email);
    };
    const goReset = () => {
      goForgot();
      submit();
      http.expectOne((r) => r.url.endsWith('/auth/forgot-password')).flush({ message: 'Código enviado a tu correo' });
      fixture.detectChanges();
    };

    it('sin email no se puede pedir el código y se puede volver al login', () => {
      goForgot('');
      expect(submitBtn().disabled).toBe(true);
      submit();
      http.expectNone((r) => r.url.endsWith('/auth/forgot-password'));
      button('Volver al login').click();
      fixture.detectChanges();
      expect(el().textContent).toContain('¿No tienes cuenta?');
    });

    it('pide el código con POST /auth/forgot-password y pasa al paso del código', () => {
      goForgot();
      submit();
      const req = http.expectOne((r) => r.url.endsWith('/auth/forgot-password'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'ana@x.pe' });
      req.flush({ message: 'Código enviado a tu correo' });
      fixture.detectChanges();
      expect(toast.success).toHaveBeenCalledWith('Código enviado a tu correo');
      expect(el().textContent).toContain('Se ha enviado un código de 6 dígitos a ana@x.pe');
    });

    it('si el correo no existe responde igual, para no revelar qué cuentas hay', () => {
      goForgot();
      submit();
      http.expectOne((r) => r.url.endsWith('/auth/forgot-password'))
        .flush({ message: 'No existe' }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();
      expect(toast.success).toHaveBeenCalledWith('Si el correo existe, se ha enviado un código.');
      expect(toast.error).not.toHaveBeenCalled();
      expect(el().textContent).toContain('Código de recuperación');
    });

    it('exige código y nueva contraseña antes de enviar', () => {
      goReset();
      expect(submitBtn().disabled).toBe(true);
      type(inputs()[0], '123456');
      expect(submitBtn().disabled).toBe(true);
      submit();
      http.expectNone((r) => r.url.endsWith('/auth/reset-password'));
      type(inputs()[1], 'nueva-clave-1');
      expect(submitBtn().disabled).toBe(false);
    });

    it('cambia la contraseña con POST /auth/reset-password y vuelve al login con el email puesto', () => {
      goReset();
      type(inputs()[0], '123456');
      type(inputs()[1], 'nueva-clave-1');
      submit();
      const req = http.expectOne((r) => r.url.endsWith('/auth/reset-password'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'ana@x.pe', code: '123456', newPassword: 'nueva-clave-1' });
      req.flush({ message: 'Contraseña actualizada' });
      fixture.detectChanges();
      expect(toast.success).toHaveBeenLastCalledWith('Contraseña actualizada');
      expect(el().textContent).toContain('¿No tienes cuenta?');
      expect(inputs()[0].value).toBe('ana@x.pe');
      expect(inputs()[1].value).toBe('');
    });

    it('con un código inválido muestra el mensaje del servidor y sigue en el mismo paso', () => {
      goReset();
      type(inputs()[0], '000000');
      type(inputs()[1], 'nueva-clave-1');
      submit();
      http.expectOne((r) => r.url.endsWith('/auth/reset-password'))
        .flush({ message: 'El código ha expirado' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      expect(el().querySelector('.alert-error')!.textContent).toContain('El código ha expirado');
      expect(el().textContent).toContain('Código de recuperación');
      expect(submitBtn().disabled).toBe(false);
    });

    it('sin mensaje del servidor usa el texto por defecto', () => {
      goReset();
      type(inputs()[0], '000000');
      type(inputs()[1], 'nueva-clave-1');
      submit();
      http.expectOne((r) => r.url.endsWith('/auth/reset-password')).flush(null, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      expect(el().querySelector('.alert-error')!.textContent).toContain('Código inválido o expirado');
    });
  });
});
