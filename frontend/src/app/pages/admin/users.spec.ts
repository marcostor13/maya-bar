import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminUsersComponent } from './users';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const ANA = { _id: 'u1', name: 'Ana', email: 'ana@x.pe', role: 'MANAGER', isActive: true, tenantId: 't1', tenantName: 'Empresa X', lastAccessAt: '2026-11-05T09:15:00' };
const LUIS = { _id: 'u2', email: 'luis@y.pe', role: 'SERVER', isActive: false, tenantId: 't2', tenantName: 'Empresa Y' };

describe('AdminUsersComponent', () => {
  let fixture: ComponentFixture<AdminUsersComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn(), state: () => null };
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (label: string, root: ParentNode = el()) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim() === label)!;
  const row = (email: string) =>
    Array.from(el().querySelectorAll<HTMLElement>('tbody tr')).find((r) => r.textContent!.includes(email))!;
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fixture.detectChanges();
  };

  async function searchFor(q: string, results: unknown[]) {
    const input = el().querySelector('input[name="q"]') as HTMLInputElement;
    input.value = q;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    const req = http.expectOne((r) => r.url.endsWith('/admin/users'));
    expect(req.request.params.get('q')).toBe(q);
    req.flush(results);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    confirm.confirm.mockResolvedValue(true);
    await TestBed.configureTestingModule({
      imports: [AdminUsersComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminUsersComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });
  afterEach(() => http.verify());

  it('no busca con menos de 2 letras', () => {
    const input = el().querySelector('input[name="q"]') as HTMLInputElement;
    input.value = 'a';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(button('Buscar', el().querySelector('form')!).disabled).toBe(true);
    http.expectNone((r) => r.url.endsWith('/admin/users'));
  });

  it('muestra cada usuario con su empresa, rol, último acceso y estado', async () => {
    await searchFor('pe', [ANA, LUIS]);
    expect(row('ana@x.pe').querySelector('.td-tenant')!.textContent).toContain('Empresa X');
    expect(row('ana@x.pe').textContent).toContain('Gerente');
    expect(row('ana@x.pe').querySelector('.td-access')!.textContent).toContain('05/11/2026 09:15');
    expect(row('luis@y.pe').querySelector('.td-access')!.textContent).toContain('Nunca');
    expect(row('luis@y.pe').textContent).toContain('Inactivo');
  });

  it('si la búsqueda falla lo dice en la página y deja reintentar', () => {
    const input = el().querySelector('input[name="q"]') as HTMLInputElement;
    input.value = 'ana';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    http.expectOne((r) => r.url.endsWith('/admin/users')).flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(el().textContent).toContain('No se pudo completar la búsqueda.');
    expect(toast.error).toHaveBeenCalled();
    button('Reintentar').click();
    http.expectOne((r) => r.url.endsWith('/admin/users')).flush([ANA]);
    fixture.detectChanges();
    expect(row('ana@x.pe')).toBeTruthy();
  });

  it('sin resultados lo dice', async () => {
    await searchFor('nadie', []);
    expect(el().textContent).toContain('Ningún usuario coincide con "nadie"');
  });

  it('desactivar confirma, manda PATCH :id/active y avisa', async () => {
    await searchFor('ana', [ANA]);
    button('Desactivar', row('ana@x.pe')).click();
    await settle();
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true, message: expect.stringContaining('Empresa X') }));
    const req = http.expectOne((r) => r.url.endsWith('/admin/users/u1/active'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ isActive: false });
    req.flush({});
    fixture.detectChanges();
    expect(toast.success).toHaveBeenCalledWith('Usuario desactivado');
    expect(row('ana@x.pe').textContent).toContain('Inactivo');
  });

  it('activar no pide confirmación', async () => {
    await searchFor('luis', [LUIS]);
    button('Activar', row('luis@y.pe')).click();
    http.expectOne((r) => r.url.endsWith('/admin/users/u2/active')).flush({});
    expect(confirm.confirm).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Usuario activado');
  });

  it('restablecer y eliminar usan las rutas del superadmin', async () => {
    await searchFor('ana', [ANA]);
    row('ana@x.pe').querySelector<HTMLButtonElement>('.actions button')!.click();
    fixture.detectChanges();
    expect(el().querySelector('app-reset-access-dialog')).toBeTruthy();
    button('Cancelar', el().querySelector('app-reset-access-dialog')!).click();
    fixture.detectChanges();

    button('Eliminar', row('ana@x.pe')).click();
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/admin/users/u1/impact')).flush({ items: [], total: 0 });
    http.expectOne((r) => r.url.endsWith('/admin/users/u1/reassign-candidates')).flush([]);
  });

  it('la pestaña Registro carga el registro de toda la plataforma', () => {
    button('Registro').click();
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/admin/users/audit')).flush([]);
  });
});
