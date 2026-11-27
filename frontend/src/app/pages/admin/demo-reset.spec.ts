import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DemoResetComponent, DemoAccess } from './demo-reset';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/admin/demo/reset`;
const ACCESS: DemoAccess = {
  tenantId: 't1', email: 'demo@demo.mayacrm.site', password: 'Abc23456789x',
  users: [{ name: 'Valeria', email: 'demo@demo.mayacrm.site', role: 'TENANT_ADMIN' }, { name: 'Diego', email: 'diego@demo.mayacrm.site', role: 'MANAGER' }],
  counts: { customers: 32, conversations: 30, leads: 42 },
};

describe('DemoResetComponent (HU86 C8)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };

  async function render() {
    await TestBed.configureTestingModule({
      imports: [DemoResetComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(DemoResetComponent);
    f.detectChanges();
    return { f, c: f.componentInstance, el: f.nativeElement as HTMLElement };
  }

  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('pide confirmación; si se cancela no llama al API', async () => {
    confirm.confirm.mockResolvedValue(false);
    const { c } = await render();
    await c.reset();
    expect(confirm.confirm).toHaveBeenCalled();
    http.expectNone(API);
  });

  it('al confirmar restablece y muestra los accesos con toast', async () => {
    confirm.confirm.mockResolvedValue(true);
    const { f, c, el } = await render();
    await c.reset();
    const req = http.expectOne(API);
    expect(req.request.method).toBe('POST');
    req.flush(ACCESS);
    f.detectChanges();
    expect(el.querySelector('[data-test="demo-email"]')?.textContent).toContain('demo@demo.mayacrm.site');
    expect(el.querySelector('[data-test="demo-password"]')?.textContent).toContain('Abc23456789x');
    expect(el.textContent).toContain('diego@demo.mayacrm.site');
    expect(toast.success).toHaveBeenCalledWith('Demo lista');
    expect(el.querySelector('[data-test="demo-incognito"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    f.detectChanges();
    expect(el.querySelector('[data-test="demo-password"]')).toBeNull();
  });

  it('si falla avisa con el mensaje del servidor', async () => {
    confirm.confirm.mockResolvedValue(true);
    const { c } = await render();
    await c.reset();
    http.expectOne(API).flush({ message: 'Ya existe una empresa real con el correo o el nombre de la demo' }, { status: 409, statusText: 'Conflict' });
    expect(toast.error).toHaveBeenCalledWith('Ya existe una empresa real con el correo o el nombre de la demo');
    expect(c.busy()).toBe(false);
  });
});
