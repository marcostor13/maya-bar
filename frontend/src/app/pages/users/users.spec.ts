import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UsersComponent } from './users';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const ADMIN = { _id: 'u1', name: 'Dueña', email: 'admin@x.pe', role: 'TENANT_ADMIN', isActive: true, mustChangePassword: false, createdAt: '2026-01-01' };
const PEDRO = { _id: 'u2', name: 'Pedro Ruiz', email: 'pedro@x.pe', role: 'MANAGER', isActive: true, localIds: ['l1'], mustChangePassword: true, createdAt: '2026-02-01' };
const INACTIVA = { _id: 'u3', email: 'ines@x.pe', role: 'MARKETING', isActive: false, localIds: [], mustChangePassword: false, createdAt: '2026-03-01' };
const LOCALS = [{ _id: 'l1', name: 'Sede Centro' }, { _id: 'l2', name: 'Sede Norte' }];
const ROLES = [{ key: 'MANAGER', label: 'Gerente' }, { key: 'SERVER', label: 'Mesero' }, { key: 'ventas', label: 'Ventas' }];

describe('UsersComponent', () => {
  let fixture: ComponentFixture<UsersComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };

  const el = () => fixture.nativeElement as HTMLElement;
  const button = (label: string, root: ParentNode = el()) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim().includes(label))!;
  const row = (email: string) =>
    Array.from(el().querySelectorAll<HTMLElement>('tbody tr')).find((r) => r.textContent!.includes(email))!;
  const actions = (email: string) =>
    Array.from(row(email).querySelectorAll('.actions button')).map((b) => b.textContent!.trim());
  const drawer = () => el().querySelector('.drawer') as HTMLElement;
  const delModal = () => el().querySelector('.modal-card') as HTMLElement;
  const click = (target: HTMLElement) => { target.click(); fixture.detectChanges(); };
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fixture.detectChanges();
  };
  const type = (name: string, value: string) => {
    const input = drawer().querySelector(`[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    fixture.detectChanges();
  };
  const submit = () => {
    drawer().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  };
  const expectUsers = () => http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/users'));

  async function mount(roles: unknown[] = ROLES, locals: unknown[] = LOCALS) {
    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(UsersComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/roles')).flush(roles);
    http.expectOne((r) => r.url.endsWith('/locals')).flush(locals);
  }
  async function setup(users: unknown[] = [ADMIN, PEDRO, INACTIVA]) {
    await mount();
    expectUsers().flush(users);
    fixture.detectChanges();
  }
  /** Abre el panel y espera a que ngModel registre sus controles. */
  async function openDrawer(open: () => void) {
    open();
    fixture.detectChanges();
    await fixture.whenStable();
    await settle();
  }
  function openDelete(email: string, impact: object, candidates: unknown[] = []) {
    click(button('Eliminar', row(email)));
    const id = email === PEDRO.email ? 'u2' : 'u3';
    const imp = http.expectOne((r) => r.url.endsWith(`/users/${id}/impact`));
    const cand = http.expectOne((r) => r.url.endsWith(`/users/${id}/reassign-candidates`));
    expect(imp.request.method).toBe('GET');
    expect(cand.request.method).toBe('GET');
    imp.flush(impact);
    cand.flush(candidates);
    fixture.detectChanges();
  }

  beforeEach(() => { vi.clearAllMocks(); confirm.confirm.mockResolvedValue(true); });
  afterEach(() => http.verify());

  describe('listado', () => {
    it('mientras carga lo dice', async () => {
      await mount();
      expect(el().querySelector('.loading-msg')!.textContent).toContain('Cargando…');
      expectUsers().flush([]);
    });

    it('sin usuarios muestra el vacío con su llamada a crear', async () => {
      await setup([]);
      expect(el().textContent).toContain('No hay usuarios registrados aún.');
      expect(button('Crear primer usuario')).toBeTruthy();
      expect(el().querySelector('table')).toBeNull();
    });

    it('si falla la carga avisa con un toast', async () => {
      await mount();
      expectUsers().flush(null, { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Error al cargar usuarios');
      expect(el().querySelector('.loading-msg')).toBeNull();
    });

    it('pinta rol, locales, estado y la marca de contraseña temporal', async () => {
      await setup();
      expect(row(PEDRO.email).textContent).toContain('Gerente');
      expect(row(PEDRO.email).querySelector('.td-locals')!.textContent).toContain('Sede Centro');
      expect(row(PEDRO.email).querySelector('.badge-success')!.textContent).toContain('Activo');
      expect(row(PEDRO.email).querySelector('.badge-warning')!.textContent).toContain('Temp');

      expect(row(INACTIVA.email).querySelector('.td-name')!.textContent).toContain('—');
      expect(row(INACTIVA.email).querySelector('.td-locals')!.textContent).toContain('Todos');
      expect(row(INACTIVA.email).querySelector('.badge-neutral')!.textContent).toContain('Inactivo');
      expect(row(INACTIVA.email).classList.contains('row-inactive')).toBe(true);
      expect(row(INACTIVA.email).querySelector('.badge-warning')).toBeNull();
    });

    it('al administrador de la empresa no se le puede editar, desactivar ni eliminar', async () => {
      await setup();
      expect(actions(ADMIN.email)).toEqual([]);
      expect(actions(PEDRO.email)).toEqual(['Editar', 'Desactivar', 'Eliminar']);
      expect(actions(INACTIVA.email)).toEqual(['Editar', 'Activar', 'Eliminar']);
    });
  });

  describe('crear', () => {
    it('exige email y ofrece los roles configurados por la empresa', async () => {
      await setup();
      await openDrawer(() => button('+ Nuevo usuario').click());
      expect(drawer().querySelector('h2')!.textContent).toContain('Nuevo usuario');
      expect(button('Guardar', drawer()).disabled).toBe(true);
      const options = Array.from(drawer().querySelectorAll('select[name="role"] option')).map((o) => o.textContent!.trim());
      expect(options).toEqual(['Gerente', 'Mesero', 'Ventas']);
      type('email', 'luis@x.pe');
      expect(button('Guardar', drawer()).disabled).toBe(false);
    });

    it('manda POST /users con nombre, email, rol y locales, y enseña la contraseña temporal una vez', async () => {
      await setup();
      await openDrawer(() => button('+ Nuevo usuario').click());
      type('name', 'Luis Soto');
      type('email', 'luis@x.pe');
      type('role', 'ventas');
      const chip = Array.from(drawer().querySelectorAll<HTMLElement>('.local-chip')).find((c) => c.textContent!.includes('Sede Norte'))!;
      chip.querySelector('input')!.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(chip.classList.contains('on')).toBe(true);
      submit();
      expect(button('Guardando…', drawer()).disabled).toBe(true);

      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/users'));
      expect(req.request.body).toEqual({ name: 'Luis Soto', email: 'luis@x.pe', role: 'ventas', localIds: ['l2'] });
      req.flush({
        user: { _id: 'u9', name: 'Luis Soto', email: 'luis@x.pe', role: 'ventas', isActive: true, localIds: ['l2'], mustChangePassword: true, createdAt: '2026-10-01' },
        tempPassword: 'Tmp-48213',
      });
      fixture.detectChanges();

      expect(drawer()).toBeNull();
      const creds = el().querySelector('.cred-block')!;
      expect(creds.textContent).toContain('luis@x.pe');
      expect(creds.querySelector('.cred-pass')!.textContent).toContain('Tmp-48213');
      expect(el().querySelector('tbody tr')!.textContent).toContain('luis@x.pe');
      expect(row('luis@x.pe').textContent).toContain('ventas');

      click(button('Entendido'));
      expect(el().querySelector('.cred-block')).toBeNull();
      expect(el().textContent).not.toContain('Tmp-48213');
    });

    it('si el servidor rechaza el alta muestra su mensaje en toast y en el formulario', async () => {
      await setup();
      await openDrawer(() => button('+ Nuevo usuario').click());
      type('email', 'pedro@x.pe');
      submit();
      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/users'))
        .flush({ message: 'Ya existe un usuario con ese email' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Ya existe un usuario con ese email');
      expect(drawer().querySelector('.form-error')!.textContent).toContain('Ya existe un usuario con ese email');
      expect(el().querySelector('.cred-block')).toBeNull();
      expect(button('Guardar', drawer()).disabled).toBe(false);
    });

    it('sin locales en la empresa no se pinta el selector de locales', async () => {
      await mount(ROLES, []);
      expectUsers().flush([PEDRO]);
      fixture.detectChanges();
      await openDrawer(() => button('+ Nuevo usuario').click());
      expect(drawer().querySelector('.locals-grid')).toBeNull();
      // Sin catálogo de locales se cuenta cuántos tiene asignados.
      expect(row(PEDRO.email).querySelector('.td-locals')!.textContent).toContain('1 local(es)');
    });
  });

  describe('editar', () => {
    it('manda PATCH /users/:id con nombre, rol y locales (el email no se edita) y avisa', async () => {
      await setup();
      await openDrawer(() => button('Editar', row(PEDRO.email)).click());
      expect(drawer().querySelector('h2')!.textContent).toContain('Editar usuario');
      expect(drawer().querySelector('[name="email"]')).toBeNull();
      type('name', 'Pedro R.');
      type('role', 'SERVER');
      submit();

      const req = http.expectOne((r) => r.url.endsWith('/users/u2'));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Pedro R.', role: 'SERVER', localIds: ['l1'] });
      req.flush({ _id: 'u2', name: 'Pedro R.', role: 'SERVER' });
      fixture.detectChanges();

      expect(toast.success).toHaveBeenCalledWith('Usuario actualizado');
      expect(drawer()).toBeNull();
      expect(row(PEDRO.email).textContent).toContain('Pedro R.');
      expect(row(PEDRO.email).textContent).toContain('Mesero');
    });

    it('si falla muestra el mensaje del servidor y deja el panel abierto', async () => {
      await setup();
      await openDrawer(() => button('Editar', row(PEDRO.email)).click());
      submit();
      http.expectOne((r) => r.url.endsWith('/users/u2'))
        .flush({ message: 'Rol no permitido' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Rol no permitido');
      expect(drawer().querySelector('.form-error')!.textContent).toContain('Rol no permitido');
    });
  });

  describe('desactivar y activar', () => {
    it('desactivar pide confirmación; cancelada no manda nada', async () => {
      await setup();
      confirm.confirm.mockResolvedValue(false);
      click(button('Desactivar', row(PEDRO.email)));
      await settle();
      expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Desactivar usuario', confirmText: 'Desactivar', danger: true,
        message: expect.stringContaining('Pedro Ruiz'),
      }));
      http.expectNone((r) => r.method === 'DELETE');
      expect(actions(PEDRO.email)).toContain('Desactivar');
    });

    it('confirmada manda DELETE /users/:id, avisa y la fila pasa a inactiva', async () => {
      await setup();
      click(button('Desactivar', row(PEDRO.email)));
      await settle();
      const req = http.expectOne((r) => r.url.endsWith('/users/u2'));
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      fixture.detectChanges();
      expect(toast.success).toHaveBeenCalledWith('Usuario desactivado');
      expect(row(PEDRO.email).textContent).toContain('Inactivo');
      expect(actions(PEDRO.email)).toEqual(['Editar', 'Activar', 'Eliminar']);
    });

    it('si falla desactivar avisa con un toast de error y la fila sigue activa', async () => {
      await setup();
      click(button('Desactivar', row(PEDRO.email)));
      await settle();
      http.expectOne((r) => r.url.endsWith('/users/u2')).flush(null, { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Error al desactivar usuario');
      expect(actions(PEDRO.email)).toContain('Desactivar');
    });

    it('activar manda PATCH /users/:id con isActive: true y avisa', async () => {
      await setup();
      click(button('Activar', row(INACTIVA.email)));
      const req = http.expectOne((r) => r.url.endsWith('/users/u3'));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ isActive: true });
      req.flush({ ...INACTIVA, isActive: true });
      fixture.detectChanges();
      expect(toast.success).toHaveBeenCalledWith('Usuario activado');
      expect(actions(INACTIVA.email)).toEqual(['Editar', 'Desactivar', 'Eliminar']);
    });

    it('si falla activar avisa con un toast de error', async () => {
      await setup();
      click(button('Activar', row(INACTIVA.email)));
      http.expectOne((r) => r.url.endsWith('/users/u3')).flush(null, { status: 500, statusText: 'Error' });
      expect(toast.error).toHaveBeenCalledWith('Error al activar usuario');
    });
  });

  describe('eliminar definitivamente', () => {
    const IMPACT = {
      userId: 'u2', name: 'Pedro Ruiz', email: 'pedro@x.pe', role: 'MANAGER', total: 5,
      items: [{ collection: 'leads', label: 'Oportunidades', count: 3 }, { collection: 'tasks', label: 'Tareas', count: 2 }],
    };
    const NADA = { ...IMPACT, total: 0, items: [] };

    it('primero calcula el impacto y no elimina nada hasta confirmarlo', async () => {
      await setup();
      click(button('Eliminar', row(PEDRO.email)));
      expect(delModal().textContent).toContain('Eliminar a Pedro Ruiz');
      expect(delModal().textContent).toContain('Calculando qué tiene asociado…');
      expect(button('Eliminar definitivamente', delModal()).disabled).toBe(true);

      http.expectOne((r) => r.url.endsWith('/users/u2/impact')).flush(IMPACT);
      http.expectOne((r) => r.url.endsWith('/users/u2/reassign-candidates')).flush([INACTIVA]);
      fixture.detectChanges();

      expect(delModal().textContent!.replace(/\s+/g, ' ')).toContain('Tiene 5 registro(s) asociados');
      const items = Array.from(delModal().querySelectorAll('.impact-list li')).map((li) => li.textContent);
      expect(items).toEqual(['Oportunidades3', 'Tareas2']);
      expect(button('Eliminar definitivamente', delModal()).disabled).toBe(false);
      http.expectNone((r) => r.method === 'DELETE');
    });

    it('cancelar cierra el diálogo sin eliminar', async () => {
      await setup();
      openDelete(PEDRO.email, IMPACT);
      click(button('Cancelar', delModal()));
      expect(delModal()).toBeNull();
      http.expectNone((r) => r.method === 'DELETE');
      expect(row(PEDRO.email)).toBeTruthy();
    });

    it('sin contenido asociado manda DELETE /users/:id?mode=delete y quita la fila', async () => {
      await setup();
      openDelete(PEDRO.email, NADA);
      expect(delModal().textContent).toContain('Este usuario no tiene contenido asociado.');
      expect(delModal().querySelector('#reassign')).toBeNull();
      click(button('Eliminar definitivamente', delModal()));
      expect(button('Eliminando…', delModal()).disabled).toBe(true);

      const req = http.expectOne((r) => r.url.endsWith('/users/u2?mode=delete'));
      expect(req.request.method).toBe('DELETE');
      req.flush({ reassigned: 0 });
      fixture.detectChanges();
      expect(toast.success).toHaveBeenCalledWith('Usuario eliminado');
      expect(delModal()).toBeNull();
      expect(row(PEDRO.email)).toBeUndefined();
    });

    it('reasignando manda reassignTo y lo cuenta en el aviso', async () => {
      await setup();
      openDelete(PEDRO.email, IMPACT, [INACTIVA]);
      await settle();
      const select = delModal().querySelector('#reassign') as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.textContent!.trim())).toEqual([
        'Dejarlos a nivel de empresa (los verán los administradores)', 'Reasignar a ines@x.pe',
      ]);
      select.value = 'u3';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      click(button('Eliminar definitivamente', delModal()));

      const req = http.expectOne((r) => r.url.endsWith('/users/u2?mode=delete&reassignTo=u3'));
      expect(req.request.method).toBe('DELETE');
      req.flush({ reassigned: 5 });
      expect(toast.success).toHaveBeenCalledWith('Usuario eliminado; 5 registro(s) reasignados');
    });

    it('sin reasignar, los registros quedan liberados a nivel de empresa', async () => {
      await setup();
      openDelete(PEDRO.email, IMPACT, [INACTIVA]);
      click(button('Eliminar definitivamente', delModal()));
      http.expectOne((r) => r.url.endsWith('/users/u2?mode=delete')).flush({ reassigned: 5 });
      expect(toast.success).toHaveBeenCalledWith('Usuario eliminado; 5 registro(s) liberados');
    });

    it('si el servidor no deja eliminar muestra su mensaje y conserva al usuario', async () => {
      await setup();
      openDelete(PEDRO.email, NADA);
      click(button('Eliminar definitivamente', delModal()));
      http.expectOne((r) => r.url.endsWith('/users/u2?mode=delete'))
        .flush({ message: 'Es el único gerente' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Es el único gerente');
      expect(delModal().querySelector('.form-error')!.textContent).toContain('Es el único gerente');
      expect(button('Eliminar definitivamente', delModal()).disabled).toBe(false);
      expect(row(PEDRO.email)).toBeTruthy();
    });

    it('si no se puede calcular el impacto lo dice dentro del diálogo', async () => {
      await setup();
      click(button('Eliminar', row(INACTIVA.email)));
      http.expectOne((r) => r.url.endsWith('/users/u3/impact'))
        .flush({ message: 'Sin permiso para verlo' }, { status: 403, statusText: 'Forbidden' });
      http.expectOne((r) => r.url.endsWith('/users/u3/reassign-candidates')).flush(null, { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();
      expect(delModal().textContent).toContain('Eliminar a ines@x.pe');
      expect(delModal().querySelector('.form-error')!.textContent).toContain('Sin permiso para verlo');
      expect(delModal().textContent).not.toContain('Calculando');
    });
  });
});
