import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SecuritySettingsComponent } from './security-settings';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/auth/2fa`;
const OFF = { enabled: false, method: null, backupCodesLeft: 0, required: false, requiredBy: null, tenantRequires: false };

describe('Seguridad · doble factor (HU62)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };

  async function setup(role = 'TENANT_ADMIN') {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast }, { provide: ConfirmService, useValue: confirm },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1', email: 'a@x.pe', role }) } }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(SecuritySettingsComponent);
    f.detectChanges();
    return f;
  }
  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('activa con app, muestra los códigos de respaldo y fija la política del equipo', async () => {
    const f = await setup();
    http.expectOne(`${BASE}/status`).flush(OFF);
    f.detectChanges();
    const c = f.componentInstance;
    expect((f.nativeElement as HTMLElement).textContent).toContain('Exigir doble factor a todo el equipo');

    c.start('totp');
    http.expectOne(`${BASE}/setup`).flush({ method: 'totp', secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP' });
    expect(c.setupMethod()).toBe('totp');
    expect(c.secret()).toBe('JBSWY3DPEHPK3PXP');

    c.code = '123456';
    c.confirmSetup();
    http.expectOne(`${BASE}/setup/confirm`).flush({ backupCodes: ['aaaa-bbbb', 'cccc-dddd'] });
    http.expectOne(`${BASE}/status`).flush({ ...OFF, enabled: true, method: 'totp', backupCodesLeft: 2 });
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('aaaa-bbbb');
    expect(toast.success).toHaveBeenCalledWith('Doble factor activado');

    c.setPolicy(true);
    const p = http.expectOne(`${BASE}/policy`);
    expect(p.request.body).toEqual({ required: true });
    p.flush({ required: true });
    http.expectOne(`${BASE}/status`).flush({ ...OFF, enabled: true, method: 'totp', backupCodesLeft: 2, tenantRequires: true, required: true, requiredBy: 'tenant' });
  });

  it('desactivar pide confirmación y contraseña; si es obligatorio no se ofrece', async () => {
    const f = await setup('MANAGER');
    http.expectOne(`${BASE}/status`).flush({ ...OFF, enabled: true, method: 'email', backupCodesLeft: 10 });
    f.detectChanges();
    const c = f.componentInstance;
    expect((f.nativeElement as HTMLElement).textContent).not.toContain('Exigir doble factor');
    c.password = 'clave';
    confirm.confirm.mockResolvedValue(true);
    await c.disable();
    const d = http.expectOne(`${BASE}/disable`);
    expect(d.request.body).toEqual({ password: 'clave' });
    d.flush({ enabled: false });
    http.expectOne(`${BASE}/status`).flush({ ...OFF, enabled: true, method: 'email', backupCodesLeft: 10, required: true, requiredBy: 'tenant', tenantRequires: true });
    f.detectChanges();
    const buttons = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(buttons).not.toContain('Desactivar');
    expect((f.nativeElement as HTMLElement).textContent).toContain('no se puede desactivar');
  });
});
