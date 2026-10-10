import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { homeFor, moduleGuard } from './module.guard';
import { AuthService, AuthUser } from './auth.service';
import { PermissionsService } from './permissions.service';

const perms = (...modules: string[]) =>
  ({ can: (m: string) => modules.includes(m) }) as unknown as PermissionsService;

describe('homeFor', () => {
  it('el SUPERADMIN siempre va a /admin/tenants', () => {
    expect(homeFor('SUPERADMIN', perms('dashboard'))).toBe('/admin/tenants');
  });

  it('con panel va a /dashboard', () => {
    expect(homeFor('MANAGER', perms('customers', 'dashboard'))).toBe('/dashboard');
  });

  it('sin panel pero con panel de impulsador va a /impulsador', () => {
    expect(homeFor('IMPULSADOR', perms('impulsador-panel', 'events'))).toBe('/impulsador');
  });

  it('si no, a su primer módulo disponible en el orden fijado', () => {
    expect(homeFor('MARKETING', perms('lists', 'customers'))).toBe('/customers');
    expect(homeFor('MARKETING', perms('settings', 'inbox'))).toBe('/inbox');
  });

  it('usa la ruta real cuando no coincide con la clave del módulo', () => {
    expect(homeFor('HOST', perms('visits'))).toBe('/visitas');
  });

  it('sin ningún módulo va a /change-password para no entrar en bucle', () => {
    expect(homeFor('HOST', perms())).toBe('/change-password');
  });
});

describe('moduleGuard', () => {
  const user = signal<AuthUser | null>(null);
  let router: Router;
  let modules: string[] = [];
  const load = vi.fn();

  const run = (key: string) =>
    TestBed.runInInjectionContext(() =>
      moduleGuard(key)({} as ActivatedRouteSnapshot, { url: '/x' } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;

  beforeEach(() => {
    vi.clearAllMocks();
    modules = [];
    load.mockResolvedValue(undefined);
    user.set({ id: 'u1', email: 'a@x.pe', role: 'MARKETING' });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: user } },
        { provide: PermissionsService, useValue: { load, can: (m: string) => modules.includes(m) } },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('espera a que carguen los permisos antes de decidir', async () => {
    let release!: () => void;
    load.mockReturnValue(new Promise<void>((r) => (release = r)));
    let settled = false;
    const pending = run('customers').then((v) => { settled = true; return v; });
    await Promise.resolve();
    expect(settled).toBe(false);
    modules = ['customers'];
    release();
    expect(await pending).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('con el módulo permitido deja pasar', async () => {
    modules = ['customers'];
    expect(await run('customers')).toBe(true);
  });

  it('sin el módulo redirige a la primera pantalla disponible', async () => {
    modules = ['lists'];
    const res = await run('customers');
    expect(res).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(res as UrlTree)).toBe('/lists');
  });

  it('el SUPERADMIN sin el módulo vuelve a /admin/tenants', async () => {
    user.set({ id: 'u0', email: 's@x.pe', role: 'SUPERADMIN' });
    expect(router.serializeUrl((await run('customers')) as UrlTree)).toBe('/admin/tenants');
  });

  it('sin sesión ni módulos acaba en /change-password', async () => {
    user.set(null);
    expect(router.serializeUrl((await run('customers')) as UrlTree)).toBe('/change-password');
  });
});
