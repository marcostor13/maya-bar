import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { OutboxService, SEND_TIMEOUT_MS, newClientId, type OutboxBody } from './outbox';
import { AuthService } from '../auth/auth.service';
import { ConversationsRealtimeService } from './conversations-realtime';
import { environment } from '../../environments/environment';

const API = environment.apiUrl;
const KEY = 'maya.outbox.u1';
const body = (clientId: string, text = 'Hola'): OutboxBody => ({ clientId, text, type: 'text' });
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('OutboxService (HU24)', () => {
  let http: HttpTestingController;
  let resync: Subject<void>;

  function make(): OutboxService {
    resync = new Subject<void>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1', tenantId: 't1' }) } },
        { provide: ConversationsRealtimeService, useValue: { resync$: resync } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(OutboxService);
  }

  const stored = () => JSON.parse(localStorage.getItem(KEY) ?? '[]') as { clientId: string; state: string }[];
  const post = (conv: string) => http.expectOne(`${API}/conversations/${conv}/messages`);
  const offline = (conv: string) => post(conv).error(new ProgressEvent('error'), { status: 0 });

  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => {
    http?.verify();
    localStorage.removeItem(KEY);
  });

  it('newClientId cumple el formato que acepta el servidor', () => {
    expect(newClientId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(newClientId()).not.toBe(newClientId());
  });

  it('C4/C5: sin red queda en cola, guardado en el dispositivo, sin perder el texto', async () => {
    const outbox = make();
    const changed = vi.fn();
    outbox.changed$.subscribe(changed);
    void outbox.send('c1', body('cid-00000001', 'Sin cobertura'));
    offline('c1');
    await settle();
    expect(outbox.forConversation('c1').map(i => [i.state, i.body.text])).toEqual([['queued', 'Sin cobertura']]);
    expect(stored().map(i => i.state)).toEqual(['queued']);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'queued' }));
  });

  it('C4: la cola sobrevive a reabrir la app (lo que iba enviando vuelve a la cola)', () => {
    localStorage.setItem(KEY, JSON.stringify([
      { clientId: 'cid-00000001', conversationId: 'c1', body: body('cid-00000001'), createdAt: 'x', state: 'sending' },
    ]));
    const outbox = make();
    expect(outbox.forConversation('c1').map(i => i.state)).toEqual(['queued']);
  });

  it('C5: al volver la red se envían en orden, una vez cada uno, y salen de la cola', async () => {
    localStorage.setItem(KEY, JSON.stringify([
      { clientId: 'cid-00000001', conversationId: 'c1', body: body('cid-00000001', 'uno'), createdAt: '1', state: 'queued' },
      { clientId: 'cid-00000002', conversationId: 'c1', body: body('cid-00000002', 'dos'), createdAt: '2', state: 'queued' },
    ]));
    const outbox = make();
    const sent = vi.fn();
    outbox.sent$.subscribe(sent);
    window.dispatchEvent(new Event('online'));
    const first = post('c1');
    expect(first.request.body).toEqual(body('cid-00000001', 'uno'));
    first.flush({ _id: 'm1' });
    await settle();
    const second = post('c1');
    expect(second.request.body.clientId).toBe('cid-00000002');
    second.flush({ _id: 'm2' });
    await settle();
    expect(sent.mock.calls.map(c => c[0].message._id)).toEqual(['m1', 'm2']);
    expect(outbox.forConversation('c1')).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('C5: un fallo de red detiene la tanda y no pierde los siguientes; la reconexión la retoma', async () => {
    const outbox = make();
    void outbox.send('c1', body('cid-00000001'));
    offline('c1');
    await settle();
    void outbox.send('c1', body('cid-00000002'));
    // Va el primero (orden), vuelve a fallar por red y el segundo espera.
    offline('c1');
    await settle();
    expect(outbox.forConversation('c1').map(i => i.state)).toEqual(['queued', 'queued']);
    resync.next();
    post('c1').flush({ _id: 'm1' });
    await settle();
    post('c1').flush({ _id: 'm2' });
    await settle();
    expect(outbox.forConversation('c1')).toEqual([]);
  });

  it('C6: un rechazo del servidor lo deja fallido en la cola; reintentar lo reenvía con el mismo clientId', async () => {
    const outbox = make();
    void outbox.send('c1', body('cid-00000001'));
    post('c1').flush({ message: 'Este contacto está bloqueado' }, { status: 400, statusText: 'Bad Request' });
    await settle();
    expect(outbox.forConversation('c1').map(i => [i.state, i.error])).toEqual([['failed', 'Este contacto está bloqueado']]);
    // Un fallido no sale solo al volver la red: espera al operador.
    window.dispatchEvent(new Event('online'));
    http.expectNone(`${API}/conversations/c1/messages`);

    void outbox.retry('cid-00000001');
    const again = post('c1');
    expect(again.request.body.clientId).toBe('cid-00000001');
    again.flush({ _id: 'm1' });
    await settle();
    expect(outbox.forConversation('c1')).toEqual([]);
  });

  it('C5: si la pasarela no tiene backend (502/503/504) queda en cola, no fallido', async () => {
    const outbox = make();
    void outbox.send('c1', body('cid-00000001'));
    post('c1').flush('', { status: 502, statusText: 'Bad Gateway' });
    await settle();
    expect(outbox.forConversation('c1').map(i => i.state)).toEqual(['queued']);
  });

  it('C5: una petición colgada por cobertura débil se da por sin red', async () => {
    vi.useFakeTimers();
    try {
      const outbox = make();
      void outbox.send('c1', body('cid-00000001'));
      const req = post('c1');
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
      expect(req.cancelled).toBe(true);
      expect(outbox.forConversation('c1').map(i => i.state)).toEqual(['queued']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('descartar lo quita de la cola y del dispositivo', async () => {
    const outbox = make();
    void outbox.send('c1', body('cid-00000001'));
    offline('c1');
    await settle();
    outbox.discard('cid-00000001');
    expect(outbox.forConversation('c1')).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
