import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Component, input, output } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { RegisterComponent } from './register';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';
import { TurnstileComponent } from '../../shared/turnstile';

/** Sustituye al widget real: en jsdom no hay Cloudflare que cargar. */
@Component({ selector: 'app-turnstile', standalone: true, template: '' })
class TurnstileStub {
  siteKey = input.required<string>();
  token = output<string | null>();
}

const DATA: Record<string, string> = {
  name: 'La Mar S.A.C.', ruc: '20123456789', phone: '+51 999 999 999',
  email: 'contacto@lamar.pe', ownerName: 'Juan Pérez', ownerPassword: 'clave-segura',
};

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let http: HttpTestingController;
  let router: Router;
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };

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

  /** Por defecto sin captcha; las pruebas del captcha pasan una clave. */
  const create = (siteKey = '') => {
    fixture = TestBed.createComponent(RegisterComponent);
    (fixture.componentInstance as { siteKey: string }).siteKey = siteKey;
    fixture.detectChanges();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    history.replaceState(null, '');
    toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast },
      ],
    })
      .overrideComponent(RegisterComponent, {
        remove: { imports: [TurnstileComponent] },
        add: { imports: [TurnstileStub] },
      })
      .compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    create();
  });

  afterEach(() => { http.verify(); localStorage.clear(); history.replaceState(null, ''); });

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

  describe('con captcha', () => {
    beforeEach(() => create('site-key'));

    const emitToken = (token: string | null) => {
      const stub = fixture.debugElement.query((d) => d.componentInstance instanceof TurnstileStub)
        .componentInstance as TurnstileStub;
      stub.token.emit(token);
      fixture.detectChanges();
    };

    it('no deja enviar hasta pasar el captcha y manda el token con el alta', () => {
      fill(DATA);
      expect(submitBtn().disabled).toBe(true);
      emitToken('tok-captcha');
      expect(submitBtn().disabled).toBe(false);

      submit();
      const req = http.expectOne((r) => r.url.endsWith('/auth/register'));
      expect(req.request.body).toEqual({ ...DATA, captchaToken: 'tok-captcha' });
      req.flush({ verificationRequired: true, email: DATA['email'] });
    });

    it('si el captcha caduca vuelve a bloquear el envío', () => {
      fill(DATA);
      emitToken('tok');
      emitToken(null);
      expect(submitBtn().disabled).toBe(true);
    });
  });

  describe('verificación de correo', () => {
    const codeInput = () => el().querySelector('#verify-code') as HTMLInputElement;
    const typeCode = (v: string) => {
      codeInput().value = v;
      codeInput().dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const verifyBtn = () => el().querySelector('.verify-form button[type="submit"]') as HTMLButtonElement;

    const registerPending = () => {
      fill(DATA);
      submit();
      http.expectOne((r) => r.url.endsWith('/auth/register'))
        .flush({ verificationRequired: true, email: DATA['email'] });
      fixture.detectChanges();
    };

    it('si el alta pide confirmar no abre sesión y muestra la pantalla del código', () => {
      registerPending();
      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
      expect(router.navigate).not.toHaveBeenCalled();
      expect(el().textContent).toContain('Revisa tu correo');
      expect(el().textContent).toContain(DATA['email']);
      expect(codeInput()).toBeTruthy();
    });

    it('con el código correcto guarda la sesión y va al onboarding', () => {
      registerPending();
      typeCode('12345');
      expect(verifyBtn().disabled).toBe(true);
      typeCode('123456');
      expect(verifyBtn().disabled).toBe(false);

      el().querySelector('.verify-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      const req = http.expectOne((r) => r.url.endsWith('/auth/verify-email'));
      expect(req.request.body).toEqual({ email: DATA['email'], code: '123456' });
      req.flush({ access_token: 'tok', refresh_token: 'ref', user: { id: 'u1', email: DATA['email'], role: 'TENANT_ADMIN' } });

      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
      expect(router.navigate).toHaveBeenCalledWith(['/onboarding']);
    });

    it('un código malo muestra el error del servidor y no entra', () => {
      registerPending();
      typeCode('000000');
      el().querySelector('.verify-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      http.expectOne((r) => r.url.endsWith('/auth/verify-email'))
        .flush({ message: 'El código es inválido o ha expirado' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      expect(el().querySelector('.alert-error')!.textContent).toContain('El código es inválido');
      expect(toast.error).toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('reenviar pide un código nuevo para el mismo correo', () => {
      registerPending();
      const resend = [...el().querySelectorAll('.verify-actions button')]
        .find((b) => b.textContent?.includes('Reenviar')) as HTMLButtonElement;
      resend.click();
      const req = http.expectOne((r) => r.url.endsWith('/auth/resend-verification'));
      expect(req.request.body).toEqual({ email: DATA['email'] });
      req.flush({ message: 'enviado' });
      expect(toast.success).toHaveBeenCalledWith('enviado');
    });

    it('al llegar desde el login con un correo sin confirmar pide el código y reenvía uno', () => {
      history.replaceState({ verifyEmail: 'pendiente@lamar.pe' }, '');
      create();
      const req = http.expectOne((r) => r.url.endsWith('/auth/resend-verification'));
      expect(req.request.body).toEqual({ email: 'pendiente@lamar.pe' });
      req.flush({ message: 'ok' });
      expect(el().textContent).toContain('pendiente@lamar.pe');
    });
  });
});
