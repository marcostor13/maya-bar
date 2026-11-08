import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { NATIVE_OPT_OUT_KEY, NativePushService } from './push.service';
import { PlatformService } from './platform.service';
import { ToastService } from '../shared/toast';

describe('NativePushService (app Android)', () => {
  let svc: NativePushService;
  const router = { url: '/dashboard', navigateByUrl: vi.fn() };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: PlatformService, useValue: { isNative: false, platform: 'web' } },
        { provide: ToastService, useValue: { info: vi.fn(), error: vi.fn(), warning: vi.fn() } },
      ],
    });
    svc = TestBed.inject(NativePushService);
  });

  it('no avisa con toast si ya está viendo esa conversación', () => {
    router.url = '/inbox?c=abc123';
    expect(svc.isWatching('abc123')).toBe(true);
    expect(svc.isWatching('otra')).toBe(false);
    router.url = '/leads';
    expect(svc.isWatching('abc123')).toBe(false);
    expect(svc.isWatching(undefined)).toBe(false);
  });

  it('"Desactivar" queda anotado para no reactivarse al abrir la app', async () => {
    await svc.turnOff();
    expect(localStorage.getItem(NATIVE_OPT_OUT_KEY)).toBe('1');
  });

  it('el cierre de sesión (disable) no marca el móvil como apagado', async () => {
    await svc.disable();
    expect(localStorage.getItem(NATIVE_OPT_OUT_KEY)).toBeNull();
  });
});
