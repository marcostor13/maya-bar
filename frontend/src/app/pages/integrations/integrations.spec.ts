import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { IntegrationsComponent, type ApiAccess, type ShareableAccount } from './integrations';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const WA: ShareableAccount = { channel: 'whatsapp', id: 'wa1', label: 'Ventas', detail: '+51 999 000 111', active: true };
const IG: ShareableAccount = { channel: 'instagram', id: 'ig1', label: 'Marca', detail: '@marca', active: false };
const ACCESS: ApiAccess = {
  _id: 'a1', name: 'Web tienda', channel: 'whatsapp', accountId: 'wa1', accountLabel: 'Ventas',
  keyPrefix: 'mk_Ab12Cd3', allowedDomains: ['mitienda.pe'], allowedIps: [], perMinuteLimit: 60,
  perDayLimit: 2000, revoked: false, sentCount: 3, createdAt: '2026-11-14T10:00:00Z',
};

describe('IntegrationsComponent', () => {
  let fixture: ComponentFixture<IntegrationsComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };

  const el = () => fixture.nativeElement as HTMLElement;
  const button = (label: string, root: ParentNode = el()) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent!.trim().includes(label))!;
  const page = () => el().querySelector('app-form-page') as HTMLElement;
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const type = (name: string, value: string) => {
    const input = page().querySelector(`[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    fixture.detectChanges();
  };
  const submit = () => {
    page().closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  };
  const expectList = () => http.expectOne(r => r.method === 'GET' && r.url.endsWith('/api-access'));

  async function setup(list: ApiAccess[] = [ACCESS], accounts: ShareableAccount[] = [WA, IG]) {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [IntegrationsComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(IntegrationsComponent);
    fixture.detectChanges();
    expectList().flush(list);
    http.expectOne(r => r.url.endsWith('/api-access/accounts')).flush(accounts);
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('lista los accesos con su cuenta, prefijo, dominios y uso', async () => {
    await setup();
    const card = el().querySelector('.access') as HTMLElement;
    expect(card.textContent).toContain('Web tienda');
    expect(card.textContent).toContain('WhatsApp · Ventas');
    expect(card.textContent).toContain('mk_Ab12Cd3…');
    expect(card.textContent).toContain('mitienda.pe');
    expect(card.textContent).toContain('3 envíos');
    expect(card.textContent).toContain('Activo');
  });

  it('si falla la carga muestra el error con reintento, no el estado vacío', async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [IntegrationsComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(IntegrationsComponent);
    fixture.detectChanges();
    expectList().flush({}, { status: 500, statusText: 'Error' });
    http.expectOne(r => r.url.endsWith('/api-access/accounts')).flush([]);
    fixture.detectChanges();
    expect(el().textContent).toContain('No se pudieron cargar los accesos');
    expect(el().textContent).not.toContain('Todavía no has creado');
    button('Reintentar').click();
    expectList().flush([ACCESS]);
    fixture.detectChanges();
    expect(el().querySelector('.access')!.textContent).toContain('Creado:');
  });

  it('sin accesos muestra el estado vacío', async () => {
    await setup([]);
    expect(el().textContent).toContain('Todavía no has creado ningún acceso');
  });

  it('C12: crea un acceso con la cuenta elegida y muestra la clave una sola vez', async () => {
    await setup([]);
    button('Nuevo acceso').click();
    fixture.detectChanges();
    await settle();
    expect(page()).not.toBeNull();
    // La cuenta inactiva no se puede elegir.
    const igOption = page().querySelector('option[value="instagram:ig1"]') as HTMLOptionElement;
    expect(igOption.disabled).toBe(true);

    type('name', 'Web');
    type('domains', 'https://mitienda.pe\n*.empresa.com');
    type('ips', '203.0.113.10');
    submit();

    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api-access'));
    expect(req.request.body).toEqual({
      name: 'Web', channel: 'whatsapp', accountId: 'wa1',
      allowedDomains: ['https://mitienda.pe', '*.empresa.com'], allowedIps: ['203.0.113.10'],
      perMinuteLimit: 60, perDayLimit: 2000,
    });
    req.flush({ access: { ...ACCESS, allowedDomains: ['mitienda.pe', '*.empresa.com'] }, key: 'mk_CLAVE_SECRETA' });
    expectList().flush([ACCESS]);
    fixture.detectChanges();

    expect(toast.success).toHaveBeenCalledWith('Acceso creado');
    const modal = el().querySelector('.key-modal') as HTMLElement;
    expect(modal.textContent).toContain('mk_CLAVE_SECRETA');
    expect(modal.textContent).toContain('Origin: https://mitienda.pe');
    button('JavaScript', modal).click();
    fixture.detectChanges();
    expect(modal.querySelector('.example')!.textContent).toContain('process.env.MAYA_API_KEY');

    button('Ya la guardé', modal).click();
    fixture.detectChanges();
    expect(el().querySelector('.key-modal')).toBeNull();
    expect(el().textContent).not.toContain('mk_CLAVE_SECRETA');
  });

  it('no envía sin dominios y avisa con toast', async () => {
    await setup([]);
    button('Nuevo acceso').click();
    fixture.detectChanges();
    await settle();
    type('name', 'Web');
    submit();
    http.expectNone(r => r.method === 'POST');
    expect(toast.error).toHaveBeenCalledWith('Autoriza al menos un dominio.');
  });

  it('muestra el error del servidor al crear', async () => {
    await setup([]);
    button('Nuevo acceso').click();
    fixture.detectChanges();
    await settle();
    type('name', 'Web');
    type('domains', 'no valido');
    submit();
    http.expectOne(r => r.method === 'POST').flush(
      { message: '"no valido" no es un dominio válido.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(toast.error).toHaveBeenCalledWith('"no valido" no es un dominio válido.');
    expect(page().textContent).toContain('no es un dominio válido');
  });

  it('edita nombre, dominios y límites sin pedir la cuenta', async () => {
    await setup();
    button('Editar').click();
    fixture.detectChanges();
    await settle();
    expect(page().querySelector('[name="account"]')).toBeNull();
    type('name', 'Web nueva');
    type('perMinute', '10');
    submit();
    const req = http.expectOne(r => r.method === 'PATCH' && r.url.endsWith('/api-access/a1'));
    expect(req.request.body).toEqual(expect.objectContaining({ name: 'Web nueva', allowedDomains: ['mitienda.pe'], perMinuteLimit: 10 }));
    req.flush({ ...ACCESS, name: 'Web nueva' });
    expectList().flush([ACCESS]);
    expect(toast.success).toHaveBeenCalledWith('Acceso actualizado');
  });

  it('C12: revocar pide confirmación; si se cancela no llama al servidor', async () => {
    await setup();
    confirm.confirm.mockResolvedValueOnce(false);
    button('Revocar').click();
    await settle();
    http.expectNone(r => r.url.endsWith('/revoke'));

    confirm.confirm.mockResolvedValueOnce(true);
    button('Revocar').click();
    await settle();
    expect(confirm.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ danger: true, confirmText: 'Revocar' }));
    http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api-access/a1/revoke')).flush({ ...ACCESS, revoked: true });
    expectList().flush([{ ...ACCESS, revoked: true }]);
    fixture.detectChanges();
    expect(toast.success).toHaveBeenCalledWith('Acceso revocado');
    expect(el().querySelector('.access')!.textContent).toContain('Revocado');
    expect(button('Revocar')).toBeUndefined();
  });

  it('regenerar muestra la clave nueva', async () => {
    await setup();
    confirm.confirm.mockResolvedValueOnce(true);
    button('Regenerar clave').click();
    await settle();
    http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api-access/a1/regenerate'))
      .flush({ access: ACCESS, key: 'mk_NUEVA' });
    expectList().flush([ACCESS]);
    fixture.detectChanges();
    expect(el().querySelector('.key-modal')!.textContent).toContain('mk_NUEVA');
  });

  it('HU14 C10: ofrece el proveedor SMS y crea un acceso SMS con ejemplo por número', async () => {
    const SMS: ShareableAccount = { channel: 'sms', id: 'sms1', label: 'Proveedor X', detail: 'MAYA', active: true };
    await setup([{ ...ACCESS, _id: 'a2', channel: 'sms', accountId: 'sms1', accountLabel: 'Proveedor X' }], [SMS]);
    expect(el().querySelector('.access')!.textContent).toContain('SMS · Proveedor X');
    button('Nuevo acceso').click();
    await settle();
    const option = page().querySelector('option[value="sms:sms1"]') as HTMLOptionElement;
    expect(option.textContent).toContain('SMS · Proveedor X (MAYA)');
    type('name', 'Web');
    type('domains', 'mitienda.pe');
    submit();
    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api-access'));
    expect(req.request.body).toMatchObject({ channel: 'sms', accountId: 'sms1' });
    req.flush({ access: { ...ACCESS, channel: 'sms' }, key: 'mk_SMS' });
    expectList().flush([]);
    fixture.detectChanges();
    expect(el().querySelector('.example')!.textContent).toContain('+51999888777');
  });

  it('HU15: al editar guarda la URL de aviso y muestra el secreto una vez', async () => {
    await setup();
    button('Editar').click();
    await settle();
    type('webhookUrl', 'https://mitienda.pe/hooks');
    submit();
    http.expectOne(r => r.method === 'PATCH').flush(ACCESS);
    const put = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/api-access/a1/webhook'));
    expect(put.request.body).toEqual({ url: 'https://mitienda.pe/hooks' });
    put.flush({ webhookUrl: 'https://mitienda.pe/hooks', secret: 'whsec_XYZ' });
    expectList().flush([{ ...ACCESS, webhookUrl: 'https://mitienda.pe/hooks' }]);
    fixture.detectChanges();
    expect(el().textContent).toContain('whsec_XYZ');
    button('Ya lo guardé').click();
    fixture.detectChanges();
    expect(el().textContent).not.toContain('whsec_XYZ');
  });

  it('HU15: rechaza una URL de aviso sin https', async () => {
    await setup();
    button('Editar').click();
    await settle();
    type('webhookUrl', 'http://mitienda.pe/hooks');
    submit();
    expect(toast.error).toHaveBeenCalledWith('La URL de aviso debe empezar por https://');
  });

  it('HU15 C7: muestra los avisos y envía una prueba', async () => {
    await setup([{ ...ACCESS, webhookUrl: 'https://mitienda.pe/hooks' }]);
    button('Avisos').click();
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/webhook/deliveries')).flush([
      { _id: 'd1', event: 'message.failed', status: 'failed', attempts: 6, lastStatus: 500, lastError: 'Tu sistema respondió 500', createdAt: '2026-11-18T10:00:00Z' },
    ]);
    fixture.detectChanges();
    const modal = el().querySelector('.key-modal') as HTMLElement;
    expect(modal.textContent).toContain('message.failed');
    expect(modal.textContent).toContain('Fallido');
    expect(modal.textContent).toContain('HTTP 500');
    button('Enviar prueba', modal).click();
    http.expectOne(r => r.method === 'POST' && r.url.endsWith('/webhook/test')).flush({ _id: 'd2', event: 'ping', status: 'pending', attempts: 0 });
    http.expectOne(r => r.url.endsWith('/webhook/deliveries')).flush([]);
    expect(toast.success).toHaveBeenCalledWith('Prueba enviada');
  });
});
