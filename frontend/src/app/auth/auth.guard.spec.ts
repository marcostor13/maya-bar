import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService, AuthUser } from './auth.service';

describe('authGuard', () => {
  const user = signal<AuthUser | null>(null);
  let router: Router;

  const run = (url: string) =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
  const urlOf = (res: unknown) => router.serializeUrl(res as UrlTree);

  beforeEach(() => {
    user.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: user, isAuthenticated: () => !!user() } },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('sin sesión manda al login', () => {
    const res = run('/dashboard');
    expect(res).toBeInstanceOf(UrlTree);
    expect(urlOf(res)).toBe('/login');
  });

  it('con sesión normal deja pasar', () => {
    user.set({ id: 'u1', email: 'a@x.pe', role: 'TENANT_ADMIN' });
    expect(run('/dashboard')).toBe(true);
  });

  it('con contraseña temporal manda a cambiarla desde cualquier otra ruta', () => {
    user.set({ id: 'u1', email: 'a@x.pe', role: 'MANAGER', mustChangePassword: true });
    expect(urlOf(run('/customers'))).toBe('/change-password');
  });

  it('con contraseña temporal deja entrar a /change-password (sin bucle)', () => {
    user.set({ id: 'u1', email: 'a@x.pe', role: 'MANAGER', mustChangePassword: true });
    expect(run('/change-password')).toBe(true);
  });
});
