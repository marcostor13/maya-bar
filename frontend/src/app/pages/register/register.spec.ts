import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { RegisterComponent } from './register';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';

const EMAIL = 'pendiente@lamar.pe';

describe('RegisterComponent (HU87: sin registro gratis)', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let http: HttpTestingController;
  let router: Router;
  let query: Record<string, string>;
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const el = () => fixture.nativeElement as HTMLElement;

  const create = () => {
    fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    history.replaceState(null, '');
    query = {};
    toast = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { get queryParamMap() { return convertToParamMap(query); } } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => { http.verify(); localStorage.clear(); history.replaceState(null, ''); });

  it('C4: sin correo pendiente lleva al checkout conservando plan y periodo', () => {
    query = { plan: 'crece', pago: 'anual' };
    create();
    expect(router.navigate).toHaveBeenCalledWith(['/checkout'], {
      queryParams: { plan: 'crece', periodo: 'anual' }, replaceUrl: true,
    });
    http.expectNone((r) => r.url.endsWith('/auth/register'));
  });

  it('C4: sin parámetros va al checkout sin nada más', () => {
    create();
    expect(router.navigate).toHaveBeenCalledWith(['/checkout'], { queryParams: {}, replaceUrl: true });
  });

  it('C5: no ofrece prueba gratis ni formulario de alta', () => {
    create();
    const text = el().textContent ?? '';
    expect(text).not.toMatch(/gratis|14 días|sin tarjeta/i);
    expect(el().querySelector('input[formControlName]')).toBeNull();
  });

  describe('confirmación de correo (cuentas pendientes)', () => {
    const codeInput = () => el().querySelector('#verify-code') as HTMLInputElement;
    const typeCode = (v: string) => {
      codeInput().value = v;
      codeInput().dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const verifyBtn = () => el().querySelector('.verify-form button[type="submit"]') as HTMLButtonElement;

    const fromLogin = () => {
      history.replaceState({ verifyEmail: EMAIL }, '');
      create();
      const req = http.expectOne((r) => r.url.endsWith('/auth/resend-verification'));
      expect(req.request.body).toEqual({ email: EMAIL });
      req.flush({ message: 'ok' });
      fixture.detectChanges();
    };

    it('C4: desde el login pide el código, reenvía uno y no redirige', () => {
      fromLogin();
      expect(el().textContent).toContain('Revisa tu correo');
      expect(el().textContent).toContain(EMAIL);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('con el código correcto guarda la sesión y va al onboarding', () => {
      fromLogin();
      typeCode('12345');
      expect(verifyBtn().disabled).toBe(true);
      typeCode('123456');
      expect(verifyBtn().disabled).toBe(false);
      el().querySelector('.verify-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      const req = http.expectOne((r) => r.url.endsWith('/auth/verify-email'));
      expect(req.request.body).toEqual({ email: EMAIL, code: '123456' });
      req.flush({ access_token: 'tok', refresh_token: 'ref', user: { id: 'u1', email: EMAIL, role: 'TENANT_ADMIN' } });
      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
      expect(router.navigate).toHaveBeenCalledWith(['/onboarding']);
    });

    it('un código malo muestra el error del servidor y no entra', () => {
      fromLogin();
      typeCode('000000');
      el().querySelector('.verify-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      http.expectOne((r) => r.url.endsWith('/auth/verify-email'))
        .flush({ message: 'El código es inválido o ha expirado' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      expect(el().querySelector('.alert-error')!.textContent).toContain('El código es inválido');
      expect(toast.error).toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('usar otro correo vuelve al login', () => {
      fromLogin();
      const other = [...el().querySelectorAll('.verify-actions button')]
        .find((b) => b.textContent?.includes('otro correo')) as HTMLButtonElement;
      other.click();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });
});
