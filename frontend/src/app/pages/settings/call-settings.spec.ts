import { provideRouter } from '@angular/router';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CallSettingsComponent, fromHHMM, toHHMM } from './call-settings';
import { ToastService } from '../../shared/toast';

const META = {
  status: 'ENABLED',
  call_icon_visibility: 'DEFAULT',
  callback_permission_status: 'DISABLED',
  call_hours: {
    status: 'ENABLED', timezone_id: 'America/Lima',
    weekly_operating_hours: [{ day_of_week: 'MONDAY', open_time: '0900', close_time: '1800' }],
  },
};
const LOCAL = { ringTimeoutSec: 30, missedReplyEnabled: false };

describe('CallSettingsComponent', () => {
  let fixture: ComponentFixture<CallSettingsComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); fixture.detectChanges(); };
  const get = () => http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/calls/settings/a1'));
  const c = () => fixture.componentInstance;

  async function mount(res: object = { meta: META, local: LOCAL }) {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [CallSettingsComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CallSettingsComponent);
    fixture.componentRef.setInput('accountId', 'a1');
    fixture.componentRef.setInput('label', 'Ventas');
    fixture.detectChanges();
    get().flush(res);
    await settle();
  }
  afterEach(() => http.verify());

  it('carga lo que devuelve Meta y guarda horario y ajustes locales', async () => {
    await mount();
    expect(c().enabled).toBe(true);
    expect(c().hoursOn).toBe(true);
    expect(c().days().find((d) => d.key === 'MONDAY')).toMatchObject({ open: true, from: '09:00', to: '18:00' });
    c().days().find((d) => d.key === 'TUESDAY')!.open = true;
    c().callback = true;
    c().missedReplyEnabled = true;
    c().missedReplyText = 'Te devolvemos la llamada';
    void c().save();
    const put = http.expectOne((r) => r.method === 'PUT');
    expect(put.request.body).toEqual({
      meta: {
        status: 'ENABLED', call_icon_visibility: 'DEFAULT', callback_permission_status: 'ENABLED',
        call_hours: {
          status: 'ENABLED', timezone_id: 'America/Lima',
          weekly_operating_hours: [
            { day_of_week: 'MONDAY', open_time: '0900', close_time: '1800' },
            { day_of_week: 'TUESDAY', open_time: '0900', close_time: '1800' },
          ],
        },
      },
      local: { ringTimeoutSec: 30, missedReplyEnabled: true, missedReplyText: 'Te devolvemos la llamada' },
    });
    put.flush({ meta: META, local: LOCAL });
    await settle();
    expect(toast.success).toHaveBeenCalledWith('Configuración de llamadas guardada');
  });

  it('valida antes de enviar', async () => {
    await mount();
    c().ringTimeoutSec = 5;
    await c().save();
    expect(toast.error).toHaveBeenCalledWith('El tiempo de espera debe estar entre 15 y 60 segundos');
    c().ringTimeoutSec = 30;
    c().missedReplyEnabled = true;
    c().missedReplyText = ' ';
    await c().save();
    expect(toast.error).toHaveBeenCalledWith('Escribe el mensaje para las llamadas perdidas');
    c().missedReplyEnabled = false;
    c().days().find((d) => d.key === 'MONDAY')!.to = '08:00';
    await c().save();
    expect(toast.error).toHaveBeenCalledWith('En cada día, la hora de cierre debe ser posterior a la de apertura');
  });

  it('si Meta no responde avisa y solo guarda lo local', async () => {
    await mount({ meta: null, metaError: 'WhatsApp: sin permiso (código 10)', local: LOCAL });
    expect(fixture.nativeElement.textContent).toContain('sin permiso (código 10)');
    void c().save();
    const put = http.expectOne((r) => r.method === 'PUT');
    expect(put.request.body).toEqual({ local: { ringTimeoutSec: 30, missedReplyEnabled: false } });
    put.flush({ message: 'WhatsApp: rechazado' }, { status: 400, statusText: 'Bad' });
    await settle();
    expect(toast.error).toHaveBeenCalledWith('WhatsApp: rechazado');
    expect(c().formError()).toBe('WhatsApp: rechazado');
  });

  it('se muestra a pantalla completa y detecta cambios tras cargar', async () => {
    await mount();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-form-page h1')?.textContent).toContain('Llamadas · Ventas');
    expect(el.querySelector('.cs-drawer')).toBeNull();
    expect(c().isDirty()).toBe(false);
    c().days().find((d) => d.key === 'MONDAY')!.to = '17:00';
    expect(c().isDirty()).toBe(true);
  });

  it('convierte horas', () => {
    expect(toHHMM('0930')).toBe('09:30');
    expect(fromHHMM('18:05')).toBe('1805');
  });
});
