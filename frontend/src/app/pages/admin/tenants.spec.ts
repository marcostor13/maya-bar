import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminTenantsComponent } from './tenants';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const LAMAR = {
  _id: 't1', name: 'La Mar S.A.C.', slug: 'la-mar', email: 'admin@lamar.pe', ruc: '20123456789',
  phone: '+51 999', plan: 'pro', isActive: true, trialEndsAt: '2026-10-20T12:00:00Z',
};
const CERRADA = { _id: 't2', name: 'Bar Cerrado', slug: 'bar-cerrado', email: 'x@bar.pe', plan: 'starter', isActive: false };

describe('AdminTenantsComponent', () => {
  let fixture: ComponentFixture<AdminTenantsComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };

  const el = () => fixture.nativeElement as HTMLElement;
  const button = (label: string, root: ParentNode = el()) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim().includes(label))!;
  const row = (name: string) =>
    Array.from(el().querySelectorAll<HTMLElement>('tbody tr')).find((r) => r.textContent!.includes(name))!;
  const action = (name: string, label: string) => row(name).querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
  const modal = () => el().querySelector('.modal') as HTMLElement;
  const click = (target: HTMLElement) => { target.click(); fixture.detectChanges(); };
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fixture.detectChanges();
  };
  const fill = (values: Record<string, string>) => {
    for (const [name, value] of Object.entries(values)) {
      const input = modal().querySelector(`[formControlName="${name}"]`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    }
    fixture.detectChanges();
  };
  const submit = () => {
    modal().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  };
  const expectTenants = () => http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/tenants'));

  async function mount() {
    await TestBed.configureTestingModule({
      imports: [AdminTenantsComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminTenantsComponent);
    fixture.detectChanges();
  }
  async function setup(tenants: unknown[] = [LAMAR, CERRADA]) {
    await mount();
    expectTenants().flush(tenants);
    fixture.detectChanges();
  }

  beforeEach(() => { vi.clearAllMocks(); confirm.confirm.mockResolvedValue(true); });
  afterEach(() => { http.verify(); vi.useRealTimers(); });

  describe('listado', () => {
    it('mientras carga lo dice', async () => {
      await mount();
      expect(el().querySelector('.loading-state')!.textContent).toContain('Cargando...');
      expectTenants().flush([]);
    });

    it('sin empresas muestra el vacío con su llamada a crear', async () => {
      await setup([]);
      expect(el().textContent).toContain('Sin empresas registradas');
      expect(button('Crear empresa')).toBeTruthy();
      expect(el().querySelector('table')).toBeNull();
    });

    it('pinta cada empresa con plan, fin de prueba y estado', async () => {
      await setup();
      expect(row('La Mar').querySelector('.tenant-slug')!.textContent).toContain('la-mar');
      expect(row('La Mar').querySelector('td[data-label="RUC"]')!.textContent).toContain('20123456789');
      expect(row('La Mar').querySelector('.badge-plan-pro')!.textContent).toContain('pro');
      expect(row('La Mar').querySelector('td[data-label="Trial hasta"]')!.textContent).toContain('20/10/2026');
      expect(row('La Mar').querySelector('.badge-active')!.textContent).toContain('Activo');
      expect(action('La Mar', 'Desactivar')).toBeTruthy();

      expect(row('Bar Cerrado').querySelector('td[data-label="RUC"]')!.textContent).toContain('—');
      expect(row('Bar Cerrado').querySelector('td[data-label="Trial hasta"]')!.textContent).toContain('—');
      expect(row('Bar Cerrado').querySelector('.badge-inactive')!.textContent).toContain('Inactivo');
      expect(action('Bar Cerrado', 'Activar')).toBeTruthy();
    });
  });

  describe('crear', () => {
    const DATA = {
      name: 'Nueva S.A.C.', email: 'admin@nueva.pe', ownerName: 'Juan García',
      ruc: '20999888777', phone: '+51 911', plan: 'enterprise',
    };

    it('exige razón social, email válido y nombre del administrador', async () => {
      await setup();
      click(button('+ Nueva empresa'));
      expect(modal().querySelector('h3')!.textContent).toContain('Nueva empresa');
      expect(button('Guardar', modal()).disabled).toBe(true);
      fill({ name: 'Nueva', email: 'no-es-email' });
      expect(modal().textContent).toContain('Ingresa un email válido.');
      expect(button('Guardar', modal()).disabled).toBe(true);
      fill({ email: 'admin@nueva.pe' });
      expect(button('Guardar', modal()).disabled).toBe(true);
      fill({ ownerName: 'Juan García' });
      expect(button('Guardar', modal()).disabled).toBe(false);
    });

    it('enviar el formulario inválido marca los errores y no manda nada', async () => {
      await setup();
      click(button('+ Nueva empresa'));
      submit();
      expect(modal().textContent).toContain('La razón social es obligatoria.');
      expect(modal().textContent).toContain('El nombre del administrador es obligatorio.');
      http.expectNone((r) => r.method === 'POST');
    });

    it('manda POST /tenants con los seis campos y enseña las credenciales una sola vez', async () => {
      await setup();
      click(button('+ Nueva empresa'));
      fill(DATA);
      submit();

      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/tenants'));
      expect(req.request.body).toEqual(DATA);
      req.flush({ tenant: { _id: 't3' }, credentials: { email: 'admin@nueva.pe', password: 'Tmp-9911' } });
      expectTenants().flush([LAMAR, CERRADA, { ...LAMAR, _id: 't3', name: 'Nueva S.A.C.', slug: 'nueva' }]);
      fixture.detectChanges();

      expect(toast.success).toHaveBeenCalledWith('Empresa creada', 'Credenciales generadas');
      expect(el().querySelector('form')).toBeNull();
      const creds = el().querySelector('.cred-box')!;
      expect(creds.textContent).toContain('admin@nueva.pe');
      expect(creds.querySelector('.cred-password')!.textContent).toContain('Tmp-9911');
      expect(row('Nueva S.A.C.')).toBeTruthy();

      click(button('Entendido'));
      expect(el().querySelector('.cred-box')).toBeNull();
      expect(el().textContent).not.toContain('Tmp-9911');
    });

    it('mientras guarda el botón queda deshabilitado', async () => {
      await setup();
      click(button('+ Nueva empresa'));
      fill(DATA);
      submit();
      expect(button('Guardando...', modal()).disabled).toBe(true);
      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/tenants')).flush({ credentials: { email: 'a', password: 'b' } });
      expectTenants().flush([]);
    });

    it('copiar una credencial la manda al portapapeles y lo confirma dos segundos', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      try {
        await setup();
        click(button('+ Nueva empresa'));
        fill(DATA);
        submit();
        http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/tenants'))
          .flush({ credentials: { email: 'admin@nueva.pe', password: 'Tmp-9911' } });
        expectTenants().flush([LAMAR]);
        fixture.detectChanges();

        vi.useFakeTimers();
        click(el().querySelectorAll<HTMLButtonElement>('.copy-btn')[1]);
        await settle();
        expect(writeText).toHaveBeenCalledWith('Tmp-9911');
        expect(el().querySelector('.copied-msg')!.textContent).toContain('¡Copiado!');
        vi.advanceTimersByTime(2000);
        fixture.detectChanges();
        expect(el().querySelector('.copied-msg')).toBeNull();
      } finally {
        if (original) Object.defineProperty(navigator, 'clipboard', original);
        else delete (navigator as unknown as Record<string, unknown>)['clipboard'];
      }
    });

    it('si el servidor rechaza el alta muestra su mensaje y deja el formulario abierto', async () => {
      await setup();
      click(button('+ Nueva empresa'));
      fill(DATA);
      submit();
      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/tenants'))
        .flush({ message: 'Ya existe una empresa con ese email' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('Ya existe una empresa con ese email');
      expect(toast.success).not.toHaveBeenCalled();
      expect(modal().querySelector('form')).not.toBeNull();
      expect(button('Guardar', modal()).disabled).toBe(false);
    });

    it('sin mensaje del servidor usa el texto por defecto', async () => {
      await setup();
      click(button('+ Nueva empresa'));
      fill(DATA);
      submit();
      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/tenants')).flush(null, { status: 500, statusText: 'Error' });
      expect(toast.error).toHaveBeenCalledWith('Error al guardar');
    });

    it('Escape cierra el formulario', async () => {
      await setup();
      click(button('+ Nueva empresa'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(modal()).toBeNull();
    });
  });

  describe('editar', () => {
    it('abre con los datos de la empresa, sin pedir administrador, y manda PATCH /tenants/:id', async () => {
      await setup();
      click(action('La Mar', 'Editar'));
      expect(modal().querySelector('h3')!.textContent).toContain('Editar empresa');
      expect(modal().querySelector('[formControlName="ownerName"]')).toBeNull();
      expect((modal().querySelector('[formControlName="name"]') as HTMLInputElement).value).toBe('La Mar S.A.C.');
      expect((modal().querySelector('[formControlName="email"]') as HTMLInputElement).value).toBe('admin@lamar.pe');
      expect(button('Guardar', modal()).disabled).toBe(false);

      fill({ name: 'La Mar Perú', plan: 'enterprise' });
      submit();
      const req = http.expectOne((r) => r.url.endsWith('/tenants/t1'));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(expect.objectContaining({
        name: 'La Mar Perú', email: 'admin@lamar.pe', ruc: '20123456789', phone: '+51 999', plan: 'enterprise',
      }));
      req.flush({ ...LAMAR, name: 'La Mar Perú' });
      expectTenants().flush([{ ...LAMAR, name: 'La Mar Perú', plan: 'enterprise' }, CERRADA]);
      fixture.detectChanges();

      expect(toast.success).toHaveBeenCalledWith('Empresa actualizada');
      expect(modal()).toBeNull();
      expect(row('La Mar Perú')).toBeTruthy();
    });

    it('si falla muestra el mensaje del servidor', async () => {
      await setup();
      click(action('La Mar', 'Editar'));
      submit();
      http.expectOne((r) => r.url.endsWith('/tenants/t1'))
        .flush({ message: 'RUC inválido' }, { status: 400, statusText: 'Bad Request' });
      expect(toast.error).toHaveBeenCalledWith('RUC inválido');
    });
  });

  describe('activar y desactivar', () => {
    it('desactivar pide confirmación; cancelada no manda nada', async () => {
      await setup();
      confirm.confirm.mockResolvedValue(false);
      click(action('La Mar', 'Desactivar'));
      await settle();
      expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: '¿Desactivar esta empresa?', confirmText: 'Desactivar', danger: true,
      }));
      http.expectNone((r) => r.method === 'PATCH');
    });

    it('confirmada manda PATCH /tenants/:id con isActive: false, avisa y recarga', async () => {
      await setup();
      click(action('La Mar', 'Desactivar'));
      await settle();
      const req = http.expectOne((r) => r.url.endsWith('/tenants/t1'));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ isActive: false });
      req.flush({});
      expect(toast.success).toHaveBeenCalledWith('Empresa desactivada');
      expectTenants().flush([{ ...LAMAR, isActive: false }, CERRADA]);
      fixture.detectChanges();
      expect(action('La Mar', 'Activar')).toBeTruthy();
    });

    it('activar no pide confirmación y manda isActive: true', async () => {
      await setup();
      click(action('Bar Cerrado', 'Activar'));
      await settle();
      expect(confirm.confirm).not.toHaveBeenCalled();
      const req = http.expectOne((r) => r.url.endsWith('/tenants/t2'));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ isActive: true });
      req.flush({});
      expect(toast.success).toHaveBeenCalledWith('Empresa activada');
      expectTenants().flush([LAMAR, { ...CERRADA, isActive: true }]);
    });

    it('si falla el cambio de estado avisa con un toast de error', async () => {
      await setup();
      click(action('Bar Cerrado', 'Activar'));
      await settle();
      http.expectOne((r) => r.url.endsWith('/tenants/t2')).flush(null, { status: 500, statusText: 'Error' });
      expect(toast.error).toHaveBeenCalledWith('Error al cambiar estado');
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe('eliminar', () => {
    it('pide confirmación nombrando la empresa; cancelada no manda nada', async () => {
      await setup();
      confirm.confirm.mockResolvedValue(false);
      click(action('La Mar', 'Eliminar'));
      await settle();
      expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: '¿Eliminar esta empresa?', confirmText: 'Eliminar', danger: true,
        message: expect.stringContaining('La Mar S.A.C.'),
      }));
      http.expectNone((r) => r.method === 'DELETE');
    });

    it('confirmada manda DELETE /tenants/:id, avisa y recarga', async () => {
      await setup();
      click(action('La Mar', 'Eliminar'));
      await settle();
      const req = http.expectOne((r) => r.url.endsWith('/tenants/t1'));
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      expect(toast.success).toHaveBeenCalledWith('Empresa eliminada');
      expectTenants().flush([CERRADA]);
      fixture.detectChanges();
      expect(row('La Mar')).toBeUndefined();
    });

    it('si el servidor no deja eliminar muestra su mensaje', async () => {
      await setup();
      click(action('La Mar', 'Eliminar'));
      await settle();
      http.expectOne((r) => r.url.endsWith('/tenants/t1'))
        .flush({ message: 'Tiene facturas pendientes' }, { status: 400, statusText: 'Bad Request' });
      expect(toast.error).toHaveBeenCalledWith('Tiene facturas pendientes');
      expect(row('La Mar')).toBeTruthy();
    });
  });
});
