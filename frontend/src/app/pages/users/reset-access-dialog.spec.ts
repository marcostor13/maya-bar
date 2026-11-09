import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ResetAccessDialogComponent } from './reset-access-dialog';
import { ToastService } from '../../shared/toast';

const API = 'http://api/users';
const PEDRO = { _id: 'u2', name: 'Pedro', email: 'pedro@x.pe' };

describe('ResetAccessDialogComponent', () => {
  let fixture: ComponentFixture<ResetAccessDialogComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim().includes(label))!;

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ResetAccessDialogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ResetAccessDialogComponent);
    fixture.componentRef.setInput('user', PEDRO);
    fixture.componentRef.setInput('apiBase', API);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('es un diálogo accesible que explica lo que pasará', () => {
    const dialog = el().querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('ra-title');
    expect(el().textContent).toContain('dejará de funcionar');
  });

  it('con contraseña temporal la muestra una vez y avisa', () => {
    const radios = el().querySelectorAll<HTMLInputElement>('input[type="radio"]');
    radios[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button('Restablecer acceso').click();

    const req = http.expectOne(`${API}/u2/reset-access`);
    expect(req.request.body).toEqual({ mode: 'temp' });
    req.flush({ mode: 'temp', tempPassword: 'Tmp@abcd1234' });
    fixture.detectChanges();

    expect(el().querySelector('.ud-pass')!.textContent).toContain('Tmp@abcd1234');
    expect(toast.success).toHaveBeenCalledWith('Acceso restablecido');
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    // Con la contraseña a la vista, ni Escape ni el clic fuera la hacen perder.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    (el().querySelector('.ud-overlay') as HTMLElement).click();
    expect(closed).not.toHaveBeenCalled();
    expect(el().querySelector('button[aria-label="Cerrar"]')).toBeNull();
    button('Entendido').click();
    expect(closed).toHaveBeenCalled();
  });

  it('por correo (la opción por defecto) avisa a quién se envió y cierra', () => {
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    button('Restablecer acceso').click();
    const req = http.expectOne(`${API}/u2/reset-access`);
    expect(req.request.body).toEqual({ mode: 'email' });
    req.flush({ mode: 'email' });
    expect(toast.success).toHaveBeenCalledWith('Código enviado a pedro@x.pe');
    expect(closed).toHaveBeenCalled();
  });

  it('si el servidor lo rechaza muestra su motivo en el diálogo y en un toast', () => {
    button('Restablecer acceso').click();
    http.expectOne(`${API}/u2/reset-access`).flush(
      { message: 'No hay un proveedor de correo configurado. Usa una contraseña temporal.' },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(el().querySelector('.ud-error')!.textContent).toContain('proveedor de correo');
    expect(toast.error).toHaveBeenCalled();
  });

  it('Escape cierra', () => {
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toHaveBeenCalled();
  });
});
