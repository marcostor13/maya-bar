import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PermissionsService } from './permissions.service';
import { AuthService, AuthUser } from './auth.service';

describe('PermissionsService', () => {
  const user = signal<AuthUser | null>(null);
  let auth: { currentUser: typeof user; permissionsReset?: () => void };
  let service: PermissionsService;
  let http: HttpTestingController;

  const expectLoad = () => http.expectOne((r) => r.url.endsWith('/me/permissions'));

  beforeEach(() => {
    user.set({ id: 'u1', email: 'a@x.pe', role: 'MARKETING' });
    auth = { currentUser: user };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: auth }],
    });
    service = TestBed.inject(PermissionsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('load hace GET /me/permissions y aplica módulos, acciones y locales', async () => {
    expect(service.ready()).toBe(false);
    const p = service.load();
    const req = expectLoad();
    expect(req.request.method).toBe('GET');
    req.flush({ role: 'MARKETING', modules: ['customers', 'lists'], actions: { customers: ['create'] }, localIds: ['l1'] });
    await p;

    expect(service.ready()).toBe(true);
    expect(service.can('customers')).toBe(true);
    expect(service.can('users')).toBe(false);
    expect(service.canAct('customers', 'create')).toBe(true);
    expect(service.canAct('customers', 'delete')).toBe(false);
    expect(service.assignedLocals()).toEqual(['l1']);
  });

  it('sin restricción configurada el módulo permite todas las acciones', async () => {
    const p = service.load();
    expectLoad().flush({ role: 'MARKETING', modules: ['lists'] });
    await p;
    expect(service.canAct('lists', 'delete')).toBe(true);
    expect(service.assignedLocals()).toEqual([]);
  });

  it('canAct es false si no se accede al módulo, aunque tenga acciones', async () => {
    const p = service.load();
    expectLoad().flush({ role: 'MARKETING', modules: ['lists'], actions: { users: ['create'] } });
    await p;
    expect(service.canAct('users', 'create')).toBe(false);
  });

  it('llamadas concurrentes comparten una sola petición y no se repite una vez cargado', async () => {
    const a = service.load();
    const b = service.load();
    expectLoad().flush({ role: 'MARKETING', modules: ['lists'] });
    await Promise.all([a, b]);
    await service.load();
    http.expectNone((r) => r.url.endsWith('/me/permissions'));
  });

  it('si la petición falla usa la matriz de respaldo del rol', async () => {
    const p = service.load();
    expectLoad().flush({ message: 'caído' }, { status: 500, statusText: 'Server Error' });
    await p;
    expect(service.ready()).toBe(true);
    expect(service.can('campaigns')).toBe(true);
    expect(service.can('users')).toBe(false);
  });

  it('antes de cargar responde con el respaldo; un rol desconocido no ve nada', () => {
    expect(service.can('dashboard')).toBe(true);
    user.set({ id: 'u2', email: 'b@x.pe', role: 'OTRO' });
    expect(service.can('dashboard')).toBe(false);
    user.set(null);
    expect(service.can('dashboard')).toBe(false);
  });

  it('el respaldo del SUPERADMIN incluye todos los módulos', () => {
    user.set({ id: 'u0', email: 's@x.pe', role: 'SUPERADMIN' });
    expect(service.can('users')).toBe(true);
    expect(service.can('impulsador-panel')).toBe(true);
  });

  it('se registra en AuthService para vaciarse al cambiar de sesión', async () => {
    const p = service.load();
    expectLoad().flush({ role: 'MARKETING', modules: ['users'], actions: { users: [] }, localIds: ['l1'] });
    await p;
    expect(service.can('users')).toBe(true);

    auth.permissionsReset!();

    expect(service.ready()).toBe(false);
    expect(service.can('users')).toBe(false); // vuelve al respaldo de MARKETING
    expect(service.assignedLocals()).toEqual([]);
  });

  it('refresh descarta lo cargado y vuelve a pedirlo', async () => {
    const p = service.load();
    expectLoad().flush({ role: 'MARKETING', modules: ['lists'] });
    await p;

    const r = service.refresh();
    expectLoad().flush({ role: 'MARKETING', modules: ['users'] });
    await r;
    expect(service.can('users')).toBe(true);
    expect(service.can('lists')).toBe(false);
  });
});
