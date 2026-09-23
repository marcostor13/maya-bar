import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { EmailSettingsComponent } from './email-settings';
import { EmailAccountsApiService } from '../../core/api/email-accounts-api.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { EMAIL_PRESETS, EmailAccount } from '../../shared/models/email.model';

const accounts: EmailAccount[] = [
  {
    _id: 'e1', label: 'Ventas', email: 'ventas@acme.pe', signature: '', provider: 'gmail',
    incomingProtocol: 'imap', incomingSecure: true, smtpSecure: true, active: true, isDefault: true,
    skipBulk: true, status: 'connected',
  },
  {
    _id: 'e2', label: 'Soporte', email: 'soporte@acme.pe', signature: '', provider: 'custom',
    incomingProtocol: 'pop3', incomingHost: 'pop.acme.pe', incomingPort: 995, incomingSecure: true,
    smtpHost: 'smtp.acme.pe', smtpPort: 465, smtpSecure: true, active: true, isDefault: false,
    skipBulk: true, status: 'error', lastError: 'credenciales rechazadas',
  },
];

const api = {
  list: vi.fn(),
  providers: vi.fn(),
  startOAuth: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setDefault: vi.fn(),
  test: vi.fn(),
  remove: vi.fn(),
};
const toast = { success: vi.fn(), error: vi.fn() };
const confirm = { confirm: vi.fn().mockResolvedValue(true) };

describe('EmailSettingsComponent', () => {
  let fixture: ComponentFixture<EmailSettingsComponent>;
  let component: EmailSettingsComponent;
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    vi.clearAllMocks();
    api.list.mockReturnValue(of(accounts));
    api.providers.mockReturnValue(of({ gmail: true, outlook: false }));
    api.create.mockReturnValue(of(accounts[1]));
    api.update.mockReturnValue(of(accounts[0]));
    api.test.mockReturnValue(of({ ok: true }));
    api.remove.mockReturnValue(of(null));

    await TestBed.configureTestingModule({
      imports: [EmailSettingsComponent],
      providers: [
        { provide: EmailAccountsApiService, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EmailSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('lista los buzones con su estado en vivo o su error', () => {
    expect(text()).toContain('ventas@acme.pe');
    expect(text()).toContain('Escuchando en vivo');
    expect(text()).toContain('credenciales rechazadas');
    expect(text()).toContain('Predeterminado');
  });

  it('deshabilita la conexión en vivo de los proveedores sin OAuth en el servidor', () => {
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.connect-btn')];
    expect(buttons[0].disabled).toBe(false); // Gmail
    expect(buttons[1].disabled).toBe(true); // Outlook
    expect(buttons[1].textContent).toContain('No habilitado');
  });

  it('un proveedor rellena los servidores y POP3 cambia puerto y host', () => {
    component.openForm();
    const yahoo = EMAIL_PRESETS.find(p => p.key === 'yahoo')!;
    component.applyPreset(yahoo);
    expect(component.form()).toMatchObject({
      incomingHost: 'imap.mail.yahoo.com', incomingPort: 993, smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465, label: 'Yahoo',
    });
    component.setProtocol('pop3');
    expect(component.form()).toMatchObject({ incomingProtocol: 'pop3', incomingHost: 'pop.mail.yahoo.com', incomingPort: 995 });
  });

  it('crea un buzón manual con los datos del formulario', () => {
    component.openForm();
    component.applyPreset(EMAIL_PRESETS.find(p => p.key === 'zoho')!);
    component.form.update(f => ({ ...f!, email: ' ventas@acme.pe ', password: 'clave' }));
    component.save();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ventas@acme.pe', password: 'clave', incomingHost: 'imap.zoho.com', smtpPort: 465, label: 'Zoho',
    }));
    expect(toast.success).toHaveBeenCalled();
    expect(component.form()).toBeNull();
  });

  it('no envía el alta sin correo o contraseña', () => {
    component.openForm();
    component.form.update(f => ({ ...f!, label: 'X' }));
    component.save();
    expect(api.create).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Escribe el correo y la contraseña');
  });

  it('al editar una cuenta de Gmail solo manda lo editable', () => {
    component.openForm(accounts[0]);
    component.form.update(f => ({ ...f!, label: 'Ventas web', signature: 'Equipo' }));
    component.save();
    expect(api.update).toHaveBeenCalledWith('e1', { label: 'Ventas web', fromName: '', signature: 'Equipo', skipBulk: true });
  });

  it('al editar una cuenta manual no manda la contraseña si no se cambió', () => {
    component.openForm(accounts[1]);
    component.save();
    const body = api.update.mock.calls[0][1];
    expect(body).not.toHaveProperty('password');
    expect(body).toMatchObject({ incomingProtocol: 'pop3', incomingHost: 'pop.acme.pe' });
  });

  it('muestra el error del servidor si la conexión falla al guardar', () => {
    api.create.mockReturnValue(throwError(() => ({ error: { message: 'No se pudo conectar: Salida (SMTP): credenciales rechazadas' } })));
    component.openForm();
    component.applyPreset(EMAIL_PRESETS[0]);
    component.form.update(f => ({ ...f!, email: 'a@b.pe', password: 'x' }));
    component.save();
    expect(toast.error).toHaveBeenCalledWith('No se pudo conectar: Salida (SMTP): credenciales rechazadas');
    expect(component.form()).not.toBeNull();
  });

  it('prueba la conexión y avisa del resultado', () => {
    api.test.mockReturnValue(of({ ok: false, error: 'Entrada (IMAP): timeout' }));
    component.test(accounts[0]);
    expect(toast.error).toHaveBeenCalledWith('Entrada (IMAP): timeout');
  });

  it('pide confirmación antes de eliminar', async () => {
    await component.remove(accounts[1]);
    expect(confirm.confirm).toHaveBeenCalled();
    expect(api.remove).toHaveBeenCalledWith('e2');
  });
});
