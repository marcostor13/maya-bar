import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthService, AuthUser } from './auth.service';

describe('roleGuard', () => {
  const user = signal<AuthUser | null>(null);
  let router: Router;

  const run = (...allowed: string[]) =>
    TestBed.runInInjectionContext(() =>
      roleGuard(...allowed)({} as ActivatedRouteSnapshot, { url: '/x' } as RouterStateSnapshot),
    );
  const urlOf = (res: unknown) => router.serializeUrl(res as UrlTree);
  const as = (role: string) => user.set({ id: 'u1', email: 'a@x.pe', role });

  beforeEach(() => {
    user.set(null);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { currentUser: user } }],
    });
    router = TestBed.inject(Router);
  });

  it('deja pasar a un rol de la lista', () => {
    as('MANAGER');
    expect(run('TENANT_ADMIN', 'MANAGER')).toBe(true);
  });

  it('un rol fuera de la lista vuelve a /dashboard', () => {
    as('MARKETING');
    expect(urlOf(run('TENANT_ADMIN'))).toBe('/dashboard');
  });

  it('el SUPERADMIN sin acceso vuelve a /admin/tenants', () => {
    as('SUPERADMIN');
    expect(urlOf(run('TENANT_ADMIN'))).toBe('/admin/tenants');
  });

  it('el IMPULSADOR sin acceso vuelve a /impulsador', () => {
    as('IMPULSADOR');
    expect(urlOf(run('TENANT_ADMIN', 'MANAGER'))).toBe('/impulsador');
  });

  it('sin usuario no pasa y va a /dashboard', () => {
    expect(urlOf(run('TENANT_ADMIN'))).toBe('/dashboard');
  });
});
