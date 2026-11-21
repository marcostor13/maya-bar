import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EventDomainCardComponent, type LandingDomainRow } from './event-domain-card';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

describe('EventDomainCardComponent (HU25)', () => {
  let fixture: ComponentFixture<EventDomainCardComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
  const confirm = { confirm: vi.fn() };
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes(text));
  const tick = async () => { await fixture.whenStable(); fixture.detectChanges(); };

  const row = (over: Partial<LandingDomainRow> = {}): LandingDomainRow => ({
    _id: 'd1', domain: 'fiesta.miempresa.com', eventId: 'e1', status: 'pending',
    checkMessage: 'El dominio aún no resuelve.',
    txtName: '_maya-verify.fiesta.miempresa.com', txtValue: 'maya-verify=abc123', ...over,
  });
  const flushList = (domains: LandingDomainRow[], canManage = true) => {
    const req = http.expectOne((r) => r.url.endsWith('/landing-domains'));
    expect(req.request.params.get('eventId')).toBe('e1');
    req.flush({ cnameTarget: 'mayacrm.site', serverIp: '52.1.145.159', selfService: true, canManage, domains });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [EventDomainCardComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EventDomainCardComponent);
    fixture.componentRef.setInput('eventId', 'e1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('C7: sin dominio muestra el formulario y las instrucciones de CNAME y A', () => {
    flushList([]);
    expect(el().querySelector('input')).not.toBeNull();
    const text = el().textContent!;
    expect(text).toContain('CNAME');
    expect(text).toContain('mayacrm.site');
    expect(text).toContain('52.1.145.159');
    expect(text).toContain('nube gris');
  });

  it('C7: conecta un dominio limpiando https:// y lo muestra con su estado', async () => {
    flushList([]);
    const input = el().querySelector('input')!;
    input.value = 'https://Fiesta.MiEmpresa.com/';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/landing-domains'));
    expect(req.request.body).toEqual({ domain: 'fiesta.miempresa.com', eventId: 'e1' });
    req.flush(row());
    await tick();
    expect(el().textContent).toContain('fiesta.miempresa.com');
    expect(el().textContent).toContain('Pendiente de DNS');
    expect(toast.info).toHaveBeenCalled();
    expect(el().querySelector('form')).toBeNull();
  });

  it('C7: un error al conectar se avisa con toast', async () => {
    flushList([]);
    const input = el().querySelector('input')!;
    input.value = 'mayacrm.site';
    input.dispatchEvent(new Event('input'));
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne((r) => r.method === 'POST').flush(
      { message: 'Ese dominio ya es el de la plataforma' }, { status: 400, statusText: 'Bad Request' },
    );
    await tick();
    expect(toast.error).toHaveBeenCalledWith('Ese dominio ya es el de la plataforma');
  });

  it('C7: verificar actualiza el estado; activo muestra el enlace', async () => {
    flushList([row()]);
    button('Verificar')!.click();
    http.expectOne((r) => r.url.endsWith('/landing-domains/d1/verify')).flush(row({ status: 'active', checkMessage: 'Dominio activo.' }));
    await tick();
    expect(toast.success).toHaveBeenCalledWith('Dominio activo');
    const link = el().querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://fiesta.miempresa.com');
    expect(button('Verificar')).toBeUndefined();
  });

  it('C7: quitar pide confirmación y borra', async () => {
    flushList([row()]);
    confirm.confirm.mockResolvedValueOnce(false);
    button('Quitar')!.click();
    await tick();
    http.expectNone((r) => r.method === 'DELETE');

    confirm.confirm.mockResolvedValueOnce(true);
    button('Quitar')!.click();
    await tick();
    http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/landing-domains/d1')).flush(null);
    await tick();
    expect(toast.success).toHaveBeenCalledWith('Dominio quitado');
    expect(el().querySelector('form')).not.toBeNull();
  });

  it('C7: con un dominio muestra el TXT que prueba la propiedad', () => {
    flushList([row()]);
    const text = el().textContent!;
    expect(text).toContain('_maya-verify.fiesta.miempresa.com');
    expect(text).toContain('maya-verify=abc123');
  });

  it('C6: sin permiso de gestión no muestra formulario ni acciones', () => {
    flushList([row()], false);
    expect(button('Verificar')).toBeUndefined();
    expect(button('Quitar')).toBeUndefined();
  });

  it('HU26 C10: indica que el logo y el favicon se configuran en Configuración', () => {
    flushList([]);
    const link = el().querySelector('.brand-hint a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/settings');
    expect(link.textContent).toContain('Marca de la empresa');
  });

  it('C6: sin permiso y sin dominio no muestra el formulario', () => {
    flushList([], false);
    expect(el().querySelector('form')).toBeNull();
  });
});
