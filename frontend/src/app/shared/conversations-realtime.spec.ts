import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConversationsRealtimeService, RESYNC_DEBOUNCE_MS } from './conversations-realtime';
import { AuthService } from '../auth/auth.service';
import { NativePushService } from '../core/push.service';
import { environment } from '../../environments/environment';

const API = environment.apiUrl;

describe('ConversationsRealtimeService → recuperar lo perdido (HU23)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  function setup() {
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
    const handlers = new Map<string, (p?: unknown) => void>();
    rt.bind({ on: ((ev: string, fn: (p?: unknown) => void) => handlers.set(ev, fn)) as never });
    const resync = vi.fn();
    rt.resync$.subscribe(resync);
    return { rt, http, handlers, resync };
  }

  it('C1: la primera conexión no pide recuperar; la reconexión sí, y relee el contador', () => {
    const { http, handlers, resync } = setup();
    handlers.get('connect')!();
    expect(resync).not.toHaveBeenCalled();
    http.expectNone(`${API}/conversations/unread-count`);

    handlers.get('disconnect')!('transport close');
    handlers.get('connect')!();
    vi.advanceTimersByTime(RESYNC_DEBOUNCE_MS);
    expect(resync).toHaveBeenCalledTimes(1);
    http.expectOne(`${API}/conversations/unread-count`).flush({ total: 2 });
    http.verify();
  });

  it('C2: volver a primer plano o recuperar la red pide recuperar y relee el contador', () => {
    const { rt, http, resync } = setup();
    const internals = rt as unknown as { onVisible: () => void; onOnline: () => void };
    internals.onVisible();
    vi.advanceTimersByTime(RESYNC_DEBOUNCE_MS);
    expect(resync).toHaveBeenCalledTimes(1);
    http.expectOne(`${API}/conversations/unread-count`).flush({ total: 0 });
    internals.onOnline();
    vi.advanceTimersByTime(RESYNC_DEBOUNCE_MS);
    expect(resync).toHaveBeenCalledTimes(2);
    http.expectOne(`${API}/conversations/unread-count`).flush({ total: 0 });
    http.verify();
  });

  it('C2: los avisos que llegan juntos al volver a la app hacen una sola relectura', () => {
    const { rt, http, handlers, resync } = setup();
    const internals = rt as unknown as { onVisible: () => void; onOnline: () => void };
    handlers.get('connect')!();
    handlers.get('disconnect')!('transport close');
    internals.onVisible();
    internals.onOnline();
    handlers.get('connect')!();
    vi.advanceTimersByTime(RESYNC_DEBOUNCE_MS);
    expect(resync).toHaveBeenCalledTimes(1);
    http.expectOne(`${API}/conversations/unread-count`).flush({ total: 0 });
    http.verify();
  });
});
