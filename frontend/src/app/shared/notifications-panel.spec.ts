import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NotificationsPanelComponent } from './notifications-panel';
import { PushService, PushPrefs, PushDevice } from './push.service';
import { NativePushService } from '../core/push.service';
import { PlatformService } from '../core/platform.service';
import { ToastService } from './toast';
import { ConfirmService } from './confirm';

const prefs: PushPrefs = { chats: true, forms: true, leads: true, recovery: true, muted: false };
const devices: PushDevice[] = [
  { id: 'n1', kind: 'android', label: 'App de Android', installed: true, createdAt: '2026-11-01T10:00:00Z' },
  { id: 'w1', kind: 'web', label: 'Safari en iPhone', installed: true, createdAt: '2026-11-02T10:00:00Z' },
];

function makeWeb() {
  return {
    permission: signal<'default' | 'granted' | 'denied' | 'unsupported'>('default'),
    subscribed: signal(false),
    serverEnabled: signal(true),
    busy: signal(false),
    supported: vi.fn(() => true),
    needsInstall: vi.fn(() => false),
    iosTooOld: vi.fn(() => false),
    deviceKind: vi.fn<() => 'ios' | 'android' | 'desktop'>(() => 'desktop'),
    currentDeviceId: vi.fn(() => 'w1'),
    enable: vi.fn().mockResolvedValue(true),
    disable: vi.fn().mockResolvedValue(undefined),
    sendTest: vi.fn().mockResolvedValue(2),
    devices: vi.fn().mockResolvedValue(devices),
    removeDevice: vi.fn().mockResolvedValue(undefined),
    preferences: vi.fn().mockResolvedValue(prefs),
    savePreferences: vi.fn((p: Partial<PushPrefs>) => Promise.resolve({ ...prefs, ...p })),
  };
}

function makeNative() {
  return {
    permission: signal<'unsupported' | 'prompt' | 'granted' | 'denied'>('prompt'),
    registered: signal(false),
    serverEnabled: signal(true),
    currentDeviceId: vi.fn(() => null as string | null),
    enable: vi.fn().mockResolvedValue(true),
    turnOff: vi.fn().mockResolvedValue(undefined),
  };
}

describe('NotificationsPanelComponent', () => {
  let fixture: ComponentFixture<NotificationsPanelComponent>;
  let web: ReturnType<typeof makeWeb>;
  let native: ReturnType<typeof makeNative>;
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
  const confirm = { confirm: vi.fn().mockResolvedValue(true) };

  async function render(isNative = false) {
    await TestBed.configureTestingModule({
      imports: [NotificationsPanelComponent],
      providers: [
        { provide: PushService, useValue: web },
        { provide: NativePushService, useValue: native },
        { provide: PlatformService, useValue: { isNative } },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsPanelComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const button = (label: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(b =>
      b.textContent?.includes(label),
    ) as HTMLButtonElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    web = makeWeb();
    native = makeNative();
  });

  it('no pide permiso al entrar; solo al pulsar Activar', async () => {
    await render();
    expect(web.enable).not.toHaveBeenCalled();
    button('Activar notificaciones')!.click();
    await fixture.whenStable();
    expect(web.enable).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalled();
  });

  it('en Safari de iPhone sin instalar muestra los pasos para añadirla a inicio', async () => {
    web.needsInstall.mockReturnValue(true);
    await render();
    expect(text()).toContain('Añadir a pantalla de inicio');
    expect(button('Activar notificaciones')).toBeUndefined();
  });

  it('con iOS anterior a 16.4 pide actualizar iOS', async () => {
    web.iosTooOld.mockReturnValue(true);
    web.needsInstall.mockReturnValue(true);
    await render();
    expect(text()).toContain('iOS 16.4 o superior');
  });

  it('con el permiso negado explica cómo reactivarlo en su plataforma', async () => {
    web.permission.set('denied');
    web.deviceKind.mockReturnValue('ios');
    await render();
    expect(text()).toContain('Ajustes del iPhone → Notificaciones → Maya CRM');
  });

  it('en la app de Android con permiso negado indica los ajustes del sistema', async () => {
    native.permission.set('denied');
    await render(true);
    expect(text()).toContain('Ajustes → Aplicaciones → Maya → Notificaciones');
  });

  it('en un navegador sin Web Push lo dice y no ofrece activar', async () => {
    web.supported.mockReturnValue(false);
    await render();
    expect(text()).toContain('no admite notificaciones push');
    expect(button('Activar notificaciones')).toBeUndefined();
  });

  it('avisa si el servidor no tiene configurado el canal', async () => {
    web.serverEnabled.set(false);
    await render();
    expect(text()).toContain('no están habilitadas en el servidor');
  });

  it('en la app nativa usa FCM para activar y desactivar', async () => {
    await render(true);
    button('Activar notificaciones')!.click();
    await fixture.whenStable();
    expect(native.enable).toHaveBeenCalled();
    expect(web.enable).not.toHaveBeenCalled();

    native.permission.set('granted');
    native.registered.set(true);
    fixture.detectChanges();
    button('Desactivar')!.click();
    await fixture.whenStable();
    expect(native.turnOff).toHaveBeenCalled();
  });

  it('activo: envía la prueba a todos los dispositivos', async () => {
    web.permission.set('granted');
    web.subscribed.set(true);
    await render();
    button('Enviar prueba')!.click();
    await fixture.whenStable();
    expect(web.sendTest).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Notificación de prueba enviada');
  });

  it('lista los dispositivos y marca el actual', async () => {
    await render();
    expect(text()).toContain('App de Android');
    expect(text()).toContain('Safari en iPhone · app instalada');
    expect(text()).toContain('Este dispositivo');
  });

  it('quita otro dispositivo tras confirmar', async () => {
    await render();
    const remove = (fixture.nativeElement as HTMLElement).querySelector(
      'button[aria-label="Quitar App de Android"]',
    ) as HTMLButtonElement;
    remove.click();
    await fixture.whenStable();
    expect(confirm.confirm).toHaveBeenCalled();
    expect(web.removeDevice).toHaveBeenCalledWith(devices[0]);
    fixture.detectChanges();
    expect(text()).not.toContain('App de Android');
  });

  it('las preferencias son interruptores accesibles que se guardan al cambiar', async () => {
    await render();
    const switches = (fixture.nativeElement as HTMLElement).querySelectorAll('input[role="switch"]');
    expect(switches.length).toBe(5);
    const leads = [...switches].find(s => s.closest('label')?.textContent?.includes('Leads')) as HTMLInputElement;
    expect(leads.getAttribute('aria-checked')).toBe('true');
    leads.checked = false;
    leads.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(web.savePreferences).toHaveBeenCalledWith({ leads: false });
  });

  it('"Silenciar todo" deshabilita los tipos de aviso', async () => {
    web.preferences.mockResolvedValue({ ...prefs, muted: true });
    await render();
    const chats = [...(fixture.nativeElement as HTMLElement).querySelectorAll('label.pref')].find(l =>
      l.textContent?.includes('Chats'),
    )!.querySelector('input') as HTMLInputElement;
    expect(chats.disabled).toBe(true);
  });
});
