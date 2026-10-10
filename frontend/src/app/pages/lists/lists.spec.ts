import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ListsComponent } from './lists';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const VIP = {
  _id: 'l1', name: 'Clientes VIP', description: 'Los mejores', type: 'static', rules: [],
  memberCount: 2, color: '#EC4899', createdAt: '2026-09-01',
};
const INACTIVOS = {
  _id: 'l2', name: 'Inactivos', type: 'dynamic', memberCount: 1, color: '#10B981', createdAt: '2026-09-02',
  rules: [
    { field: 'tags', operator: 'has_any', value: ['VIP', 'Fiel'] },
    { field: 'source', operator: 'equals', value: 'event' },
    { field: 'daysSinceLastVisit', operator: 'gte', value: 30 },
  ],
};
const ANA = { _id: 'c1', name: 'Ana Pérez', email: 'ana@x.pe', phone: '51999', tags: ['VIP', 'Fiel', 'Nuevo', 'Delivery'] };
const BETO = { _id: 'c2', name: 'Beto Ruiz', email: 'beto@x.pe', tags: [] };
const CARLA = { _id: 'c3', name: 'Carla Soto', email: 'carla@x.pe', tags: ['Corporativo'] };

describe('ListsComponent', () => {
  let fixture: ComponentFixture<ListsComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent!.replace(/\s+/g, ' ');
  const button = (label: string, root: ParentNode = el()) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes(label))!;
  const card = (name: string) =>
    Array.from(el().querySelectorAll<HTMLElement>('.list-card')).find((c) => c.textContent!.includes(name))!;
  const drawer = () => el().querySelector('.drawer') as HTMLElement;
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const click = (target: HTMLElement) => { target.click(); fixture.detectChanges(); };
  /** Deja resolver el `await confirm.confirm(...)` del componente. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fixture.detectChanges();
  };
  const expectLists = () => http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/lists'));

  async function mount() {
    await TestBed.configureTestingModule({
      imports: [ListsComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ListsComponent);
    fixture.detectChanges();
  }
  async function setup(lists: unknown[] = [VIP, INACTIVOS]) {
    await mount();
    expectLists().flush(lists);
    fixture.detectChanges();
  }
  function openMembers(members: unknown[] = [ANA, BETO]) {
    click(button('Miembros', card('Clientes VIP')));
    const req = http.expectOne((r) => r.url.endsWith('/lists/l1/members'));
    expect(req.request.method).toBe('GET');
    req.flush(members);
    fixture.detectChanges();
  }

  beforeEach(() => { vi.clearAllMocks(); confirm.confirm.mockResolvedValue(true); });
  afterEach(() => http.verify());

  describe('listado', () => {
    it('mientras carga muestra el indicador y no el vacío', async () => {
      await mount();
      expect(el().querySelector('.empty-state .spin')).not.toBeNull();
      expect(text()).not.toContain('No hay listas aún');
      expectLists().flush([]);
    });

    it('sin listas muestra el estado vacío con su llamada a crear', async () => {
      await setup([]);
      expect(text()).toContain('No hay listas aún');
      expect(button('Crear lista')).toBeTruthy();
      expect(el().querySelector('.lists-grid')).toBeNull();
    });

    it('si falla la carga avisa con un toast', async () => {
      await mount();
      expectLists().flush({ message: 'x' }, { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Error al cargar listas');
      expect(el().querySelector('.spin')).toBeNull();
    });

    it('pinta cada lista con su tipo, miembros y los totales', async () => {
      await setup();
      const stats = Array.from(el().querySelectorAll('.stat-value')).map((s) => s.textContent!.trim());
      expect(stats).toEqual(['2', '1', '1', '3']);
      expect(card('Clientes VIP').querySelector('.type-badge')!.textContent).toContain('Estática');
      expect(card('Clientes VIP').textContent).toContain('Los mejores');
      expect(card('Clientes VIP').textContent).toContain('2 miembros');
      expect(card('Inactivos').querySelector('.type-badge')!.textContent).toContain('Dinámica');
      expect(card('Inactivos').textContent!.replace(/\s+/g, ' ')).toContain('1 miembro ');
    });

    it('una dinámica resume sus dos primeras reglas y cuenta el resto', async () => {
      await setup();
      const chips = Array.from(card('Inactivos').querySelectorAll('.rule-chip')).map((c) => c.textContent!.replace(/\s+/g, ' ').trim());
      expect(chips).toEqual(['Etiquetas contiene alguna de VIP, Fiel', 'Origen es igual a Evento', '+1 más']);
    });

    it('solo las estáticas ofrecen gestionar miembros', async () => {
      await setup();
      expect(button('Miembros', card('Clientes VIP'))).toBeTruthy();
      expect(button('Miembros', card('Inactivos'))).toBeUndefined();
    });
  });

  describe('crear y editar', () => {
    it('sin nombre avisa en el formulario y no manda nada', async () => {
      await setup();
      click(button('Nueva Lista'));
      click(button('Guardar lista'));
      expect(drawer().querySelector('.error-box')!.textContent).toContain('El nombre es obligatorio');
      http.expectNone((r) => r.method === 'POST');
    });

    it('crea una estática con POST /lists, avisa, cierra y recarga', async () => {
      await setup();
      click(button('Nueva Lista'));
      expect(drawer().querySelector('.drawer-title')!.textContent).toContain('Nueva lista');
      const [name, description] = Array.from(drawer().querySelectorAll<HTMLInputElement>('input.input'));
      type(name, '  Cumpleañeros  ');
      type(description, ' Del mes ');
      click(drawer().querySelectorAll<HTMLButtonElement>('.color-dot')[2]);
      click(button('Guardar lista'));
      expect(button('Guardando...').disabled).toBe(true);

      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/lists'));
      expect(req.request.body).toEqual({
        name: 'Cumpleañeros', description: 'Del mes', type: 'static', rules: [], color: '#F59E0B',
      });
      req.flush({ ...VIP, _id: 'l9' });
      fixture.detectChanges();

      expect(toast.success).toHaveBeenCalledWith('Lista creada');
      expect(drawer()).toBeNull();
      expectLists().flush([VIP]);
    });

    it('la descripción vacía no viaja en el cuerpo', async () => {
      await setup();
      click(button('Nueva Lista'));
      type(drawer().querySelector('input.input') as HTMLInputElement, 'Solo nombre');
      click(button('Guardar lista'));
      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/lists'));
      expect(req.request.body.description).toBeUndefined();
      req.flush(VIP);
      expectLists().flush([VIP]);
    });

    it('crea una dinámica con sus reglas y deja ver cuántos coinciden', async () => {
      await setup();
      click(button('Nueva Lista'));
      type(drawer().querySelector('input.input') as HTMLInputElement, 'VIP fieles');
      click(button('Dinámica'));
      expect(drawer().textContent).toContain('Sin reglas = todos los clientes');
      click(button('Agregar regla'));
      const tag = (label: string) =>
        Array.from(drawer().querySelectorAll<HTMLButtonElement>('.mini-tag')).find((b) => b.textContent!.trim() === label)!;
      click(tag('VIP'));
      click(tag('Fiel'));
      click(tag('Fiel'));
      expect(tag('VIP').classList.contains('sel')).toBe(true);
      expect(tag('Fiel').classList.contains('sel')).toBe(false);
      const rules = [{ field: 'tags', operator: 'has_any', value: ['VIP'] }];

      click(button('Vista previa'));
      const preview = http.expectOne((r) => r.url.endsWith('/lists/preview-rules'));
      expect(preview.request.method).toBe('POST');
      expect(preview.request.body).toEqual({ rules });
      preview.flush({ count: 3 });
      fixture.detectChanges();
      expect(drawer().textContent).toContain('3 contactos coinciden');

      click(button('Guardar lista'));
      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/lists'));
      expect(req.request.body).toEqual({ name: 'VIP fieles', type: 'dynamic', rules, color: '#6366F1' });
      req.flush(INACTIVOS);
      expectLists().flush([INACTIVOS]);
    });

    it('si falla la vista previa avisa con un toast', async () => {
      await setup();
      click(button('Nueva Lista'));
      click(button('Dinámica'));
      click(button('Agregar regla'));
      click(button('Vista previa'));
      http.expectOne((r) => r.url.endsWith('/lists/preview-rules')).flush(null, { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Error al calcular vista previa');
      expect(button('Vista previa').disabled).toBe(false);
    });

    it('edita con PATCH /lists/:id conservando lo que no se toca y sin ofrecer cambiar el tipo', async () => {
      await setup();
      click(card('Clientes VIP').querySelector('button[title="Editar"]') as HTMLElement);
      expect(drawer().querySelector('.drawer-title')!.textContent).toContain('Editar lista');
      expect(drawer().querySelector('.type-toggle')).toBeNull();
      type(drawer().querySelector('input.input') as HTMLInputElement, 'Clientes Oro');
      click(button('Guardar lista'));

      const req = http.expectOne((r) => r.url.endsWith('/lists/l1'));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({
        name: 'Clientes Oro', description: 'Los mejores', type: 'static', rules: [], color: '#EC4899',
      });
      req.flush({ ...VIP, name: 'Clientes Oro' });
      fixture.detectChanges();
      expect(toast.success).toHaveBeenCalledWith('Lista actualizada');
      expectLists().flush([{ ...VIP, name: 'Clientes Oro' }]);
      fixture.detectChanges();
      expect(card('Clientes Oro')).toBeTruthy();
    });

    it('si el servidor rechaza el guardado muestra su mensaje en toast y en el formulario', async () => {
      await setup();
      click(button('Nueva Lista'));
      type(drawer().querySelector('input.input') as HTMLInputElement, 'Clientes VIP');
      click(button('Guardar lista'));
      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/lists'))
        .flush({ message: 'Ya existe una lista con ese nombre' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Ya existe una lista con ese nombre');
      expect(toast.success).not.toHaveBeenCalled();
      expect(drawer().querySelector('.error-box')!.textContent).toContain('Ya existe una lista con ese nombre');
      expect(button('Guardar lista').disabled).toBe(false);
    });

    it('Escape cierra el panel', async () => {
      await setup();
      click(button('Nueva Lista'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(drawer()).toBeNull();
    });
  });

  describe('eliminar', () => {
    const trash = () => card('Clientes VIP').querySelector('button[title="Eliminar"]') as HTMLElement;

    it('pide confirmación y, si se cancela, no sale ninguna petición', async () => {
      await setup();
      confirm.confirm.mockResolvedValue(false);
      click(trash());
      await settle();
      expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Eliminar lista', confirmText: 'Eliminar', danger: true,
        message: expect.stringContaining('Clientes VIP'),
      }));
      http.expectNone((r) => r.method === 'DELETE');
    });

    it('confirmada manda DELETE /lists/:id, avisa y recarga', async () => {
      await setup();
      click(trash());
      await settle();
      const req = http.expectOne((r) => r.url.endsWith('/lists/l1'));
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      expect(toast.success).toHaveBeenCalledWith('Lista eliminada');
      expectLists().flush([INACTIVOS]);
      fixture.detectChanges();
      expect(card('Clientes VIP')).toBeUndefined();
    });

    it('si el servidor no deja eliminar muestra su mensaje', async () => {
      await setup();
      click(trash());
      await settle();
      http.expectOne((r) => r.url.endsWith('/lists/l1'))
        .flush({ message: 'La usa una campaña programada' }, { status: 400, statusText: 'Bad Request' });
      expect(toast.error).toHaveBeenCalledWith('La usa una campaña programada');
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe('miembros', () => {
    const rows = () => Array.from(drawer().querySelectorAll<HTMLElement>('.member-row'));
    const names = () => rows().map((r) => r.querySelector('.member-name')!.textContent!.trim());
    const check = (box: Element) => { box.dispatchEvent(new Event('change')); fixture.detectChanges(); };

    it('abre el panel pidiendo GET /lists/:id/members y muestra el indicador mientras llega', async () => {
      await setup();
      click(button('Miembros', card('Clientes VIP')));
      expect(drawer().querySelector('.spin')).not.toBeNull();
      http.expectOne((r) => r.url.endsWith('/lists/l1/members')).flush([ANA, BETO]);
      fixture.detectChanges();
      expect(drawer().querySelector('.spin')).toBeNull();
      expect(drawer().querySelector('.drawer-title')!.textContent).toContain('Clientes VIP');
      expect(names()).toEqual(['Ana Pérez', 'Beto Ruiz']);
      expect(rows()[0].querySelector('.member-avatar')!.textContent).toContain('AP');
      const tags = Array.from(rows()[0].querySelectorAll('.member-tag')).map((t) => t.textContent!.trim());
      expect(tags).toEqual(['VIP', 'Fiel', 'Nuevo', '+1']);
    });

    it('sin miembros lo dice', async () => {
      await setup();
      openMembers([]);
      expect(drawer().textContent).toContain('Sin miembros aún.');
    });

    it('si falla la carga de miembros avisa con un toast', async () => {
      await setup();
      click(button('Miembros', card('Clientes VIP')));
      http.expectOne((r) => r.url.endsWith('/lists/l1/members')).flush(null, { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Error al cargar miembros');
    });

    it('quitar a uno pide confirmación; cancelada no manda nada', async () => {
      await setup();
      openMembers();
      confirm.confirm.mockResolvedValue(false);
      click(rows()[0].querySelector('.remove-btn') as HTMLElement);
      await settle();
      expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Quitar de la lista', danger: true, message: expect.stringContaining('Ana Pérez'),
      }));
      http.expectNone((r) => r.method === 'DELETE');
      expect(names()).toEqual(['Ana Pérez', 'Beto Ruiz']);
    });

    it('quitar a uno manda DELETE /lists/:id/members/:cid y baja el contador', async () => {
      await setup();
      openMembers();
      click(rows()[0].querySelector('.remove-btn') as HTMLElement);
      await settle();
      const req = http.expectOne((r) => r.url.endsWith('/lists/l1/members/c1'));
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      fixture.detectChanges();
      expect(toast.success).toHaveBeenCalledWith('Contacto quitado de la lista');
      expect(names()).toEqual(['Beto Ruiz']);
      expect(card('Clientes VIP').textContent!.replace(/\s+/g, ' ')).toContain('1 miembro ');
    });

    it('si no se puede quitar muestra el mensaje del servidor y lo deja en la lista', async () => {
      await setup();
      openMembers();
      click(rows()[0].querySelector('.remove-btn') as HTMLElement);
      await settle();
      http.expectOne((r) => r.url.endsWith('/lists/l1/members/c1'))
        .flush({ message: 'Sin permiso' }, { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Sin permiso');
      expect(names()).toEqual(['Ana Pérez', 'Beto Ruiz']);
    });

    it('quitar varios manda POST /lists/:id/members/remove con los ids marcados', async () => {
      await setup();
      openMembers();
      expect(button('Quitar seleccionados')).toBeUndefined();
      check(drawer().querySelector('.select-all-row input')!);
      expect(drawer().textContent).toContain('2 seleccionado(s)');
      click(button('Quitar seleccionados'));
      await settle();
      expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true, confirmText: 'Quitar' }));

      const req = http.expectOne((r) => r.url.endsWith('/lists/l1/members/remove'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ customerIds: ['c1', 'c2'] });
      req.flush({ ...VIP, memberCount: 0 });
      fixture.detectChanges();
      expect(toast.success).toHaveBeenCalledWith('2 contacto(s) quitados de la lista');
      expect(drawer().textContent).toContain('Sin miembros aún.');
      expect(card('Clientes VIP').textContent).toContain('0 miembros');
    });

    it('quitar varios cancelado no manda nada; con error muestra el mensaje del servidor', async () => {
      await setup();
      openMembers();
      check(rows()[1].querySelector('input[type="checkbox"]')!);
      confirm.confirm.mockResolvedValueOnce(false);
      click(button('Quitar seleccionados'));
      await settle();
      http.expectNone((r) => r.url.endsWith('/members/remove'));

      click(button('Quitar seleccionados'));
      await settle();
      const req = http.expectOne((r) => r.url.endsWith('/lists/l1/members/remove'));
      expect(req.request.body).toEqual({ customerIds: ['c2'] });
      req.flush({ message: 'No se pudo' }, { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('No se pudo');
      expect(names()).toEqual(['Ana Pérez', 'Beto Ruiz']);
    });

    it('agregar contactos carga GET /customers, oculta los que ya están y filtra por búsqueda', async () => {
      await setup();
      openMembers([ANA]);
      click(button('Agregar contactos'));
      expect(drawer().querySelector('.spin')).not.toBeNull();
      const req = http.expectOne((r) => r.url.endsWith('/customers'));
      expect(req.request.method).toBe('GET');
      req.flush([ANA, BETO, CARLA]);
      fixture.detectChanges();
      expect(names()).toEqual(['Beto Ruiz', 'Carla Soto']);

      type(drawer().querySelector('.picker-search input') as HTMLInputElement, 'corpor');
      expect(names()).toEqual(['Carla Soto']);
      type(drawer().querySelector('.picker-search input') as HTMLInputElement, 'zzz');
      expect(drawer().textContent).toContain('Ningún contacto coincide.');
    });

    it('agrega los elegidos con POST /lists/:id/members, avisa y recarga los miembros', async () => {
      await setup();
      openMembers([ANA]);
      click(button('Agregar contactos'));
      http.expectOne((r) => r.url.endsWith('/customers')).flush([ANA, BETO, CARLA]);
      fixture.detectChanges();
      expect(button('Agregar a la lista').disabled).toBe(true);
      check(rows()[1].querySelector('input[type="checkbox"]')!);
      expect(drawer().textContent).toContain('1 seleccionado(s)');
      click(button('Agregar a la lista'));

      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/lists/l1/members'));
      expect(req.request.body).toEqual({ customerIds: ['c3'] });
      req.flush({ ...VIP, memberCount: 3 });
      expect(toast.success).toHaveBeenCalledWith('1 contacto(s) agregados a la lista');
      http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/lists/l1/members')).flush([ANA, CARLA]);
      fixture.detectChanges();
      expect(names()).toEqual(['Ana Pérez', 'Carla Soto']);
      expect(card('Clientes VIP').textContent).toContain('3 miembros');
    });

    it('si no se pueden agregar muestra el mensaje del servidor y conserva la selección', async () => {
      await setup();
      openMembers([ANA]);
      click(button('Agregar contactos'));
      http.expectOne((r) => r.url.endsWith('/customers')).flush([BETO]);
      fixture.detectChanges();
      check(drawer().querySelector('.select-all-row input')!);
      click(button('Agregar a la lista'));
      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/lists/l1/members'))
        .flush({ message: 'Lista llena' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Lista llena');
      expect(drawer().textContent).toContain('1 seleccionado(s)');
      expect(button('Agregar a la lista').disabled).toBe(false);
    });

    it('si falla la carga de contactos avisa con un toast', async () => {
      await setup();
      openMembers([ANA]);
      click(button('Agregar contactos'));
      http.expectOne((r) => r.url.endsWith('/customers')).flush(null, { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Error al cargar contactos');
    });
  });
});
