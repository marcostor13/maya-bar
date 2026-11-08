import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PushService, WEB_DEVICE_KEY, WEB_OPT_OUT_KEY, iosVersion } from './push.service';
import { ConversationsRealtimeService, updateAppBadge } from './conversations-realtime';
import { AuthService } from '../auth/auth.service';
import { NativePushService } from '../core/push.service';

const API = 'http://localhost:3000';
const flushMicrotasks = () => new Promise(r => setTimeout(r, 0));

describe('iosVersion', () => {
  it('lee la versión de iOS del User-Agent', () => {
    expect(iosVersion('Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) Safari/604.1')).toEqual([16, 3]);
    expect(iosVersion('Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X)')).toEqual([17, 1]);
  });

  it('no confunde un Mac (ni un iPad en modo escritorio) con un iOS viejo', () => {
    expect(iosVersion('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15')).toBeNull();
    expect(iosVersion('Mozilla/5.0 (Linux; Android 14) Chrome/130')).toBeNull();
  });
});

describe('PushService (web)', () => {
  let svc: PushService;
  let http: HttpTestingController;
  const fakeSub = {
    endpoint: 'https://push.example/1',
    options: { applicationServerKey: null },
    toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    localStorage.clear();
    (globalThis as unknown as { Notification: unknown }).Notification = { permission: 'granted' };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    svc = TestBed.inject(PushService);
    http = TestBed.inject(HttpTestingController);
    (svc as unknown as { registration: unknown }).registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(fakeSub),
        subscribe: vi.fn().mockResolvedValue(fakeSub),
      },
    };
  });

  afterEach(() => http.verify());

  const sync = () => (svc as unknown as { syncSubscription: () => Promise<void> }).syncSubscription();

  it('con el permiso dado renueva la suscripción en silencio y guarda el id', async () => {
    const done = sync();
    await flushMicrotasks();
    http.expectOne(`${API}/push/status`).flush({ enabled: true, devices: 1 });
    await flushMicrotasks();
    http.expectOne(`${API}/push/public-key`).flush({ publicKey: 'AAAA', enabled: true });
    await flushMicrotasks();
    const req = http.expectOne(`${API}/push/subscribe`);
    expect(req.request.body).toMatchObject({ endpoint: fakeSub.endpoint, installed: false });
    req.flush({ id: 'dev-1' });
    await done;
    expect(localStorage.getItem(WEB_DEVICE_KEY)).toBe('dev-1');
    expect(svc.subscribed()).toBe(true);
  });

  it('tras "Desactivar" no se vuelve a suscribir sola al abrir la app', async () => {
    const off = svc.disable();
    await flushMicrotasks();
    http.expectOne(r => r.method === 'DELETE' && r.url === `${API}/push/subscribe`).flush({});
    await off;
    expect(localStorage.getItem(WEB_OPT_OUT_KEY)).toBe('1');

    const done = sync();
    await flushMicrotasks();
    http.expectOne(`${API}/push/status`).flush({ enabled: true, devices: 0 });
    await done;
    http.expectNone(`${API}/push/public-key`);
  });

  it('al cerrar sesión da de baja el dispositivo sin marcarlo como apagado', async () => {
    const out = svc.detach();
    await flushMicrotasks();
    http.expectOne(r => r.method === 'DELETE' && r.url === `${API}/push/subscribe`).flush({});
    await out;
    expect(localStorage.getItem(WEB_OPT_OUT_KEY)).toBeNull();
  });
});

describe('updateAppBadge', () => {
  it('pone el número en el ícono y lo limpia con 0', () => {
    const nav = navigator as unknown as Record<string, unknown>;
    const set = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn().mockResolvedValue(undefined);
    nav['setAppBadge'] = set;
    nav['clearAppBadge'] = clear;
    updateAppBadge(5);
    expect(set).toHaveBeenCalledWith(5);
    updateAppBadge(0);
    expect(clear).toHaveBeenCalled();
    delete nav['setAppBadge'];
    delete nav['clearAppBadge'];
  });

  it('sin soporte no hace nada', () => {
    expect(() => updateAppBadge(3)).not.toThrow();
  });
});

describe('ConversationsRealtimeService → insignia', () => {
  it('sincroniza el ícono con el total sin leer y lo limpia en 0', () => {
    const nav = navigator as unknown as Record<string, unknown>;
    const set = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn().mockResolvedValue(undefined);
    nav['setAppBadge'] = set;
    nav['clearAppBadge'] = clear;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: () => ({ tenantId: 't1' }) } },
        { provide: NativePushService, useValue: { clearConversation: vi.fn() } },
      ],
    });
    const rt = TestBed.inject(ConversationsRealtimeService);
    const http = TestBed.inject(HttpTestingController);

    rt.refreshUnread();
    http.expectOne(`${API}/conversations/unread-count`).flush({ total: 3 });
    expect(set).toHaveBeenCalledWith(3);

    rt.refreshUnread();
    http.expectOne(`${API}/conversations/unread-count`).flush({ total: 0 });
    expect(clear).toHaveBeenCalled();
    http.verify();
    delete nav['setAppBadge'];
    delete nav['clearAppBadge'];
  });
});
