import { signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TransferAdminDialogComponent } from './transfer-admin-dialog';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const API = 'http://api/users';
const ROLES = [
  { key: 'TENANT_ADMIN', label: 'Administrador' },
  { key: 'MANAGER', label: 'Gerente' },
  { key: 'SERVER', label: 'Mesero' },
];

describe('TransferAdminDialogComponent', () => {
  let fixture: ComponentFixture<TransferAdminDialogComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirmState = signal<unknown>(null);
  const confirm = { confirm: vi.fn(), state: confirmState };
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim().includes(label))!;
  const choose = (name: string, value: string) => {
    const sel = el().querySelector(`select[name="${name}"]`) as HTMLSelectElement;
    sel.value = value;
    sel.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fixture.detectChanges();
  };

  async function mount(candidates = [{ _id: 'u2', name: 'Pedro', email: 'p@x.pe' }]) {
    await TestBed.configureTestingModule({
      imports: [TransferAdminDialogComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TransferAdminDialogComponent);
    fixture.componentRef.setInput('candidates', candidates);
    fixture.componentRef.setInput('roles', ROLES);
    fixture.componentRef.setInput('apiBase', API);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    confirmState.set(null);
    confirm.confirm.mockResolvedValue(true);
  });
  afterEach(() => http.verify());

  it('no ofrece "Administrador" como rol propio', async () => {
    await mount();
    const roles = Array.from(el().querySelectorAll('select[name="role"] option')).map((o) => o.textContent!.trim());
    expect(roles).toEqual(['Gerente', 'Mesero']);
  });

  it('sin persona elegida no deja traspasar; con ella confirma y manda el traspaso', async () => {
    await mount();
    expect(button('Traspasar').disabled).toBe(true);
    choose('to', 'u2');
    choose('role', 'SERVER');
    const done = vi.fn();
    fixture.componentInstance.done.subscribe(done);
    button('Traspasar').click();
    await settle();

    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true, message: expect.stringContaining('Pedro') }));
    const req = http.expectOne(`${API}/transfer-admin`);
    expect(req.request.body).toEqual({ toUserId: 'u2', newRole: 'SERVER' });
    req.flush({ ok: true });
    expect(toast.success).toHaveBeenCalledWith('Administración traspasada');
    expect(done).toHaveBeenCalled();
  });

  it('si se cancela la confirmación no manda nada', async () => {
    await mount();
    confirm.confirm.mockResolvedValue(false);
    choose('to', 'u2');
    button('Traspasar').click();
    await settle();
    http.expectNone(`${API}/transfer-admin`);
  });

  it('sin otros usuarios activos lo explica', async () => {
    await mount([]);
    expect(el().textContent).toContain('No hay otros usuarios activos');
  });

  it('Escape no cierra mientras la confirmación está abierta', async () => {
    await mount();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    confirmState.set({ title: 'x' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).not.toHaveBeenCalled();
    confirmState.set(null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toHaveBeenCalled();
  });
});
