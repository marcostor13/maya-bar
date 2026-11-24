import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TenantDetailComponent, type TenantOverview } from './tenant-detail';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const OVERVIEW: TenantOverview = {
  tenant: {
    _id: 't1', name: 'La Mar S.A.C.', slug: 'la-mar', email: 'admin@lamar.pe', ruc: '20123456789',
    phone: '+51 999', plan: 'crece', isActive: true, trialEndsAt: '2026-10-20T12:00:00Z',
  },
  users: [
    { _id: 'u1', name: 'Ana', email: 'ana@lamar.pe', role: 'TENANT_ADMIN', isActive: true, lastAccessAt: '2026-11-17T15:00:00Z' },
    { _id: 'u2', name: 'Beto', email: 'beto@lamar.pe', role: 'SALES', isActive: false },
  ],
  owner: { _id: 'u1', name: 'Ana', email: 'ana@lamar.pe', role: 'TENANT_ADMIN', isActive: true, lastAccessAt: '2026-11-17T15:00:00Z' },
  usage: { contacts: 120, conversations: 45, messagesOut30d: 300, accounts: { whatsapp: 2, instagram: 1, messenger: 0, email: 1 }, apiAccesses: 3 },
};

describe('TenantDetailComponent (HU16)', () => {
  let fixture: ComponentFixture<TenantDetailComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };

  const el = () => fixture.nativeElement as HTMLElement;
  const button = (label: string, root: ParentNode = el()) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim().includes(label))!;
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function setup(overview = OVERVIEW) {
    vi.clearAllMocks();
    confirm.confirm.mockResolvedValue(true);
    await TestBed.configureTestingModule({
      imports: [TenantDetailComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TenantDetailComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/admin/tenants/t1/overview')).flush(overview);
    http.expectOne((r) => r.url.endsWith('/admin/tenants/t1/audit')).flush([
      { _id: 'a1', action: 'update', actorEmail: 'root@maya.pe', at: '2026-11-18T10:00:00Z', changes: { plan: { from: 'inicia', to: 'crece' } } },
    ]);
    await settle();
  }

  afterEach(() => http.verify());

  it('C8: muestra datos, usuarios, uso y registro', async () => {
    await setup();
    expect((el().querySelector('#td-name') as HTMLInputElement).value).toBe('La Mar S.A.C.');
    expect((el().querySelector('#td-trial') as HTMLInputElement).value).toBe('2026-10-20');
    expect(el().textContent).toContain('ana@lamar.pe');
    expect(el().textContent).toContain('Administrador');
    expect(el().textContent).toContain('Desactivado');
    expect(el().textContent).toContain('Nunca');
    expect(el().textContent).toContain('120');
    expect(el().textContent).toContain('enviados (30 días)');
    expect(el().textContent).toContain('Editó los datos');
    expect(el().textContent).toContain('plan: inicia → crece');
  });

  it('guarda los datos con plan y fechas', async () => {
    await setup();
    const plan = el().querySelector('#td-plan') as HTMLSelectElement;
    plan.value = 'escala';
    plan.dispatchEvent(new Event('change'));
    const exp = el().querySelector('#td-plan-exp') as HTMLInputElement;
    exp.value = '2027-01-31';
    exp.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/tenants/t1'));
    expect(req.request.body).toMatchObject({ plan: 'escala', planExpiresAt: '2027-01-31', trialEndsAt: '2026-10-20' });
    req.flush({ ...OVERVIEW.tenant, plan: 'escala', planExpiresAt: '2027-01-31T00:00:00Z' });
    http.expectOne((r) => r.url.endsWith('/audit')).flush([]);
    expect(toast.success).toHaveBeenCalledWith('Empresa actualizada');
  });

  it('C8: suspender pide confirmación y avisa', async () => {
    await setup();
    button('Suspender').click();
    await settle();
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Suspender empresa', danger: true }));
    const req = http.expectOne((r) => r.method === 'PATCH');
    expect(req.request.body).toEqual({ isActive: false });
    req.flush({ ...OVERVIEW.tenant, isActive: false });
    http.expectOne((r) => r.url.endsWith('/audit')).flush([]);
    fixture.detectChanges();
    expect(toast.success).toHaveBeenCalledWith('Empresa suspendida');
    expect(button('Reactivar')).toBeTruthy();
  });

  it('suspender cancelado no manda nada', async () => {
    await setup();
    confirm.confirm.mockResolvedValue(false);
    button('Suspender').click();
    await settle();
    http.expectNone((r) => r.method === 'PATCH');
  });

  it('eliminar exige escribir el nombre exacto y manda confirmName', async () => {
    await setup();
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));
    button('Eliminar').click();
    fixture.detectChanges();
    const confirmBtn = button('Eliminar definitivamente');
    expect(confirmBtn.disabled).toBe(true);
    const input = el().querySelector('#del-name') as HTMLInputElement;
    input.value = 'La Mar S.A.C.';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await settle();
    expect(button('Eliminar definitivamente').disabled).toBe(false);
    button('Eliminar definitivamente').click();
    const req = http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/tenants/t1'));
    expect(req.request.body).toEqual({ confirmName: 'La Mar S.A.C.' });
    req.flush({ deleted: true });
    expect(toast.success).toHaveBeenCalledWith('Empresa eliminada');
    expect(closed).toBe(true);
  });

  it('si falla la carga muestra el error con reintento', async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [TenantDetailComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TenantDetailComponent);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/overview')).flush({ message: 'No' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(el().textContent).toContain('No se pudo cargar la empresa');
    expect(button('Reintentar')).toBeTruthy();
  });

  describe('usuario principal (HU17 C7)', () => {
    const reload = () => {
      http.expectOne((r) => r.url.endsWith('/overview')).flush(OVERVIEW);
      http.expectOne((r) => r.url.endsWith('/audit')).flush([]);
    };

    it('muestra al principal; recuperar con correo nuevo enseña la contraseña una vez', async () => {
      await setup();
      expect(el().querySelector('#td-owner')!.parentElement!.textContent).toContain('ana@lamar.pe');
      button('Recuperar cuenta').click();
      fixture.detectChanges();
      await settle();
      const input = el().querySelector('#rec-email') as HTMLInputElement;
      expect(input.value).toBe('ana@lamar.pe');
      input.value = 'Ana.Nueva@lamar.pe';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const dialog = el().querySelector('[aria-labelledby="rec-title"]')!;
      button('Recuperar', dialog).click();
      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/admin/tenants/t1/owner/recover'));
      expect(req.request.body).toEqual({ userId: 'u1', mode: 'temp', email: 'ana.nueva@lamar.pe' });
      req.flush({ user: { ...OVERVIEW.owner, email: 'ana.nueva@lamar.pe' }, mode: 'temp', tempPassword: 'Tmp@abcd1234' });
      reload();
      await settle();
      expect(el().querySelector('.secret')!.textContent).toContain('Tmp@abcd1234');
      expect(toast.success).toHaveBeenCalledWith('Cuenta recuperada');
      button('Listo').click();
      fixture.detectChanges();
      expect(el().querySelector('.secret')).toBeNull();
    });

    it('sin administrador activo ofrece nombrar uno nuevo', async () => {
      await setup({ ...OVERVIEW, owner: null });
      expect(el().textContent).toContain('no tiene un administrador activo');
      button('Nombrar administrador').click();
      fixture.detectChanges();
      await settle();
      const opts = Array.from(el().querySelectorAll('#asg-user option')).map((o) => o.textContent!.trim());
      expect(opts.some((o) => o.startsWith('Beto'))).toBe(true);
      expect(opts.some((o) => o.startsWith('Ana'))).toBe(false);
      for (const [id, v] of [['#asg-name', 'Nuevo'], ['#asg-email', 'nuevo@lamar.pe']]) {
        const i = el().querySelector(id) as HTMLInputElement;
        i.value = v;
        i.dispatchEvent(new Event('input'));
      }
      fixture.detectChanges();
      button('Nombrar', el().querySelector('[aria-labelledby="asg-title"]')!).click();
      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/owner/assign'));
      expect(req.request.body).toEqual({ name: 'Nuevo', email: 'nuevo@lamar.pe' });
      req.flush({ user: { _id: 'u3', name: 'Nuevo', email: 'nuevo@lamar.pe', role: 'TENANT_ADMIN', isActive: true }, tempPassword: 'Tmp@ffff0000' });
      reload();
      await settle();
      expect(el().querySelector('.secret')!.textContent).toContain('Tmp@ffff0000');
    });
  });
});
