import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { ToastService } from '../shared/toast';

const USER = { id: 'u1', email: 'a@x.pe', role: 'TENANT_ADMIN' };
const API = 'http://api.test';

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let auth: AuthService;
  let router: Router;
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };

  function setup(session: { token?: string; refresh?: string } = {}) {
    localStorage.clear();
    if (session.token) {
      localStorage.setItem('token', session.token);
      localStorage.setItem('user', JSON.stringify(USER));
    }
    if (session.refresh) localStorage.setItem('refresh_token', session.refresh);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast },
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  }

  const unauthorized = { status: 401, statusText: 'Unauthorized' };

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { http.verify(); localStorage.clear(); });

  it('añade Authorization: Bearer con el token guardado', () => {
    setup({ token: 'tok-1' });
    client.get(`${API}/customers`).subscribe();
    const req = http.expectOne(`${API}/customers`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-1');
    req.flush([]);
  });

  it('sin token no añade la cabecera', () => {
    setup();
    client.get(`${API}/public/forms/x`).subscribe();
    const req = http.expectOne(`${API}/public/forms/x`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('ante un 401 renueva la sesión y reintenta una vez con el token nuevo', () => {
    setup({ token: 'viejo', refresh: 'r-1' });
    const next = vi.fn();
    client.get(`${API}/customers`).subscribe(next);

    http.expectOne(`${API}/customers`).flush({ message: 'expirado' }, unauthorized);

    const refresh = http.expectOne((r) => r.url.endsWith('/auth/refresh'));
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.body).toEqual({ refreshToken: 'r-1' });
    refresh.flush({ access_token: 'nuevo', refresh_token: 'r-2', user: USER });

    const retry = http.expectOne(`${API}/customers`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer nuevo');
    retry.flush([{ _id: 'c1' }]);

    expect(next).toHaveBeenCalledWith([{ _id: 'c1' }]);
    expect(auth.getToken()).toBe('nuevo');
    expect(auth.getRefreshToken()).toBe('r-2');
  });

  it('varias peticiones caducadas a la vez comparten una sola renovación', () => {
    setup({ token: 'viejo', refresh: 'r-1' });
    client.get(`${API}/a`).subscribe();
    client.get(`${API}/b`).subscribe();
    http.expectOne(`${API}/a`).flush(null, unauthorized);
    http.expectOne(`${API}/b`).flush(null, unauthorized);

    const refresh = http.expectOne((r) => r.url.endsWith('/auth/refresh'));
    refresh.flush({ access_token: 'nuevo', refresh_token: 'r-2', user: USER });

    const a = http.expectOne(`${API}/a`);
    const b = http.expectOne(`${API}/b`);
    expect(a.request.headers.get('Authorization')).toBe('Bearer nuevo');
    expect(b.request.headers.get('Authorization')).toBe('Bearer nuevo');
    a.flush({});
    b.flush({});
  });

  it('si el reintento vuelve a dar 401 no entra en bucle: propaga el error', () => {
    setup({ token: 'viejo', refresh: 'r-1' });
    const error = vi.fn();
    client.get(`${API}/customers`).subscribe({ error });
    http.expectOne(`${API}/customers`).flush(null, unauthorized);
    http.expectOne((r) => r.url.endsWith('/auth/refresh')).flush({ access_token: 'nuevo', refresh_token: 'r-2', user: USER });
    http.expectOne(`${API}/customers`).flush(null, unauthorized);
    expect(error).toHaveBeenCalledTimes(1);
    expect((error.mock.calls[0][0] as HttpErrorResponse).status).toBe(401);
  });

  it('si la renovación falla cierra la sesión, avisa y manda al login', () => {
    setup({ token: 'viejo', refresh: 'r-1' });
    const error = vi.fn();
    client.get(`${API}/customers`).subscribe({ error });
    http.expectOne(`${API}/customers`).flush(null, unauthorized);
    http.expectOne((r) => r.url.endsWith('/auth/refresh')).flush({ message: 'revocado' }, unauthorized);

    expect(error).toHaveBeenCalledTimes(1);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.getToken()).toBeNull();
    expect(auth.getRefreshToken()).toBeNull();
    expect(toast.warning).toHaveBeenCalledWith('Tu sesión ha caducado. Entra de nuevo.');
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('un 401 sin refresh token se propaga sin intentar renovar', () => {
    setup({ token: 'viejo' });
    const error = vi.fn();
    client.get(`${API}/customers`).subscribe({ error });
    http.expectOne(`${API}/customers`).flush(null, unauthorized);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('un 401 del propio login no dispara renovación', () => {
    setup({ token: 'viejo', refresh: 'r-1' });
    const error = vi.fn();
    client.post(`${API}/auth/login`, { email: 'a', password: 'b' }).subscribe({ error });
    http.expectOne(`${API}/auth/login`).flush({ message: 'Credenciales inválidas' }, unauthorized);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('los errores que no son 401 se propagan tal cual', () => {
    setup({ token: 'tok', refresh: 'r-1' });
    const error = vi.fn();
    client.get(`${API}/customers`).subscribe({ error });
    http.expectOne(`${API}/customers`).flush({ message: 'Prohibido' }, { status: 403, statusText: 'Forbidden' });
    const err = error.mock.calls[0][0] as HttpErrorResponse;
    expect(err.status).toBe(403);
    expect(err.error.message).toBe('Prohibido');
  });
});
