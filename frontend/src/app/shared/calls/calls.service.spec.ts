import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { CallsService, MIC_BUSY, MIC_DENIED, MIC_MISSING, MIC_UNSUPPORTED } from './calls.service';
import { CALL_MEDIA, CallView, clock, displayContact, formatDuration } from './calls.models';
import { ConversationsRealtimeService, type CallEvent } from '../conversations-realtime';
import { ToastService } from '../toast';
import { PermissionsService } from '../../auth/permissions.service';

const CALL: CallView = {
  _id: 'c1', accountId: 'a1', direction: 'inbound', status: 'ringing',
  contact: '51999888777', contactName: 'Ana', startedAt: '2026-11-09T10:00:00Z',
};
const OPTIONS = { accounts: [], users: [], iceServers: [{ urls: 'stun:x' }] };

/** RTCPeerConnection de mentira: lo justo para el flujo de oferta/respuesta. */
class FakePeer {
  iceGatheringState = 'complete';
  connectionState = 'new';
  localDescription: { type: string; sdp: string } | null = null;
  remote: { type: string; sdp: string } | null = null;
  tracks: unknown[] = [];
  closed = false;
  ontrack: unknown = null;
  onconnectionstatechange: (() => void) | null = null;
  onicegatheringstatechange: unknown = null;
  addTrack(t: unknown) { this.tracks.push(t); }
  async setRemoteDescription(d: { type: string; sdp: string }) { this.remote = d; }
  async createAnswer() { return { type: 'answer', sdp: 'answer-sdp' }; }
  async createOffer() { return { type: 'offer', sdp: 'offer-sdp' }; }
  async setLocalDescription(d: { type: string; sdp: string }) { this.localDescription = { ...d, sdp: d.sdp + '+ice' }; }
  close() { this.closed = true; }
}

describe('CallsService', () => {
  let service: CallsService;
  let http: HttpTestingController;
  let events: Subject<CallEvent>;
  let peer: FakePeer;
  let track: { enabled: boolean; stop: ReturnType<typeof vi.fn> };
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
  const media = {
    supported: vi.fn(() => true),
    getMicrophone: vi.fn(),
    createPeer: vi.fn(),
  };

  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  const emit = (event: CallEvent['event'], payload: Record<string, unknown>) => events.next({ event, payload });
  const post = (path: string) => http.expectOne((r) => r.method === 'POST' && r.url.endsWith(path));

  beforeEach(() => {
    vi.clearAllMocks();
    events = new Subject<CallEvent>();
    peer = new FakePeer();
    track = { enabled: true, stop: vi.fn() };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    media.supported.mockReturnValue(true);
    media.getMicrophone.mockResolvedValue(stream);
    media.createPeer.mockReturnValue(peer);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConversationsRealtimeService, useValue: { call$: events } },
        { provide: PermissionsService, useValue: { can: (m: string) => m === 'calls' } },
        { provide: CALL_MEDIA, useValue: media },
      ],
    });
    service = TestBed.inject(CallsService);
    http = TestBed.inject(HttpTestingController);
    service.start();
  });
  afterEach(() => http.verify());

  it('las entrantes aparecen y se retiran cuando otro la toma o termina', () => {
    emit('call:incoming', { call: CALL });
    emit('call:incoming', { call: { ...CALL, _id: 'c2' } });
    expect(service.incoming().map((c) => c._id)).toEqual(['c1', 'c2']);
    emit('call:taken', { id: 'c1', by: 'u9' });
    expect(service.incoming().map((c) => c._id)).toEqual(['c2']);
    emit('call:ended', { id: 'c2', status: 'missed' });
    expect(service.incoming()).toEqual([]);
  });

  it('aceptar: micrófono, reserva, respuesta SDP completa a la API y cronómetro', async () => {
    emit('call:incoming', { call: CALL });
    const done = service.accept(CALL);
    await settle();
    post('/calls/c1/claim').flush({ offerSdp: 'offer-from-meta' });
    await settle();
    http.expectOne((r) => r.url.endsWith('/calls/options')).flush(OPTIONS);
    await settle();
    expect(media.createPeer).toHaveBeenCalledWith(OPTIONS.iceServers);
    expect(peer.remote).toEqual({ type: 'offer', sdp: 'offer-from-meta' });
    expect(service.current()?.phase).toBe('connecting');
    const accept = post('/calls/c1/accept');
    expect(accept.request.body).toEqual({ sdp: 'answer-sdp+ice' });
    accept.flush({ ...CALL, status: 'active' });
    await done;
    expect(service.incoming()).toEqual([]);
    expect(service.current()).toMatchObject({ phase: 'active', muted: false });
    expect(service.elapsed()).toBe('00:00');
    expect(peer.tracks).toEqual([track]);
  });

  it('micrófono denegado: explica cómo darlo y no reserva la llamada', async () => {
    media.getMicrophone.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    emit('call:incoming', { call: CALL });
    await service.accept(CALL);
    expect(service.micError()).toBe(MIC_DENIED);
    expect(service.incoming()).toHaveLength(1); // sigue sonando para atenderla tras dar permiso
    expect(service.current()).toBeNull();
    http.expectNone((r) => r.url.includes('/claim'));
  });

  it('distingue sin micrófono, micrófono ocupado y navegador sin soporte', async () => {
    media.getMicrophone.mockRejectedValueOnce({ name: 'NotFoundError' });
    await service.accept(CALL);
    expect(service.micError()).toBe(MIC_MISSING);
    media.getMicrophone.mockRejectedValueOnce({ name: 'NotReadableError' });
    await service.accept(CALL);
    expect(service.micError()).toBe(MIC_BUSY);
    media.supported.mockReturnValue(false);
    await service.accept(CALL);
    expect(service.micError()).toBe(MIC_UNSUPPORTED);
    expect(media.getMicrophone).toHaveBeenCalledTimes(2);
  });

  it('si otro ya la atendió (409) avisa, la retira y no libera nada', async () => {
    emit('call:incoming', { call: CALL });
    const done = service.accept(CALL);
    await settle();
    post('/calls/c1/claim').flush({ message: 'Esta llamada ya fue atendida' }, { status: 409, statusText: 'Conflict' });
    await done;
    expect(toast.error).toHaveBeenCalledWith('Esta llamada ya fue atendida');
    expect(service.incoming()).toEqual([]);
    expect(service.current()).toBeNull();
    expect(track.stop).toHaveBeenCalled();
    http.expectNone((r) => r.url.includes('/release'));
  });

  it('si falla después de reservar, libera la reserva para los demás', async () => {
    const done = service.accept(CALL);
    await settle();
    post('/calls/c1/claim').flush({ offerSdp: 'o' });
    await settle();
    http.expectOne((r) => r.url.endsWith('/calls/options')).flush(OPTIONS);
    await settle();
    post('/calls/c1/accept').flush({ message: 'WhatsApp: error (código 138006)' }, { status: 400, statusText: 'Bad' });
    await done;
    post('/calls/c1/release').flush(null);
    expect(toast.error).toHaveBeenCalledWith('WhatsApp: error (código 138006)');
    expect(peer.closed).toBe(true);
    expect(service.current()).toBeNull();
  });

  it('llamar: oferta SDP, sonando, respuesta de Meta por socket y conectada', async () => {
    const done = service.call('a1', '51999888777');
    await settle();
    http.expectOne((r) => r.url.endsWith('/calls/options')).flush(OPTIONS);
    await settle();
    const req = post('/calls/outbound');
    expect(req.request.body).toEqual({ accountId: 'a1', contact: '51999888777', sdp: 'offer-sdp+ice' });
    req.flush({ ...CALL, _id: 'o1', direction: 'outbound', status: 'ringing' });
    expect(await done).toBe(true);
    expect(service.current()?.phase).toBe('calling');

    emit('call:answer', { id: 'o1', sdp: 'meta-answer' });
    await settle();
    expect(peer.remote).toEqual({ type: 'answer', sdp: 'meta-answer' });
    emit('call:updated', { call: { ...CALL, _id: 'o1', direction: 'outbound', status: 'active' } });
    expect(service.current()?.phase).toBe('active');
  });

  it('cuando el cliente cuelga se suelta el audio y se avisa', async () => {
    const done = service.call('a1', '51999888777');
    await settle();
    http.expectOne((r) => r.url.endsWith('/calls/options')).flush(OPTIONS);
    await settle();
    post('/calls/outbound').flush({ ...CALL, _id: 'o1', direction: 'outbound' });
    await done;
    emit('call:ended', { id: 'o1', status: 'rejected' });
    expect(service.current()).toBeNull();
    expect(track.stop).toHaveBeenCalled();
    expect(peer.closed).toBe(true);
    expect(toast.warning).toHaveBeenCalledWith('El cliente rechazó la llamada');
  });

  it('silenciar apaga la pista del micrófono y colgar avisa a la API', async () => {
    const done = service.call('a1', '51999888777');
    await settle();
    http.expectOne((r) => r.url.endsWith('/calls/options')).flush(OPTIONS);
    await settle();
    post('/calls/outbound').flush({ ...CALL, _id: 'o1', direction: 'outbound' });
    await done;
    service.toggleMute();
    expect(track.enabled).toBe(false);
    expect(service.current()?.muted).toBe(true);
    const hang = service.hangup();
    expect(service.current()).toBeNull();
    post('/calls/o1/hangup').flush({});
    await hang;
  });

  it('no deja empezar otra llamada con una en curso', async () => {
    const done = service.call('a1', '51999888777');
    await settle();
    http.expectOne((r) => r.url.endsWith('/calls/options')).flush(OPTIONS);
    await settle();
    post('/calls/outbound').flush({ ...CALL, _id: 'o1', direction: 'outbound' });
    await done;
    expect(await service.call('a1', '51911111111')).toBe(false);
    expect(toast.warning).toHaveBeenCalledWith('Ya tienes una llamada en curso');
  });

  it('rechazar la retira y avisa a la API', async () => {
    emit('call:incoming', { call: CALL });
    const done = service.reject(CALL);
    expect(service.incoming()).toEqual([]);
    post('/calls/c1/reject').flush(null);
    await done;
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('textos: cronómetro, duración y contacto', () => {
    expect(clock(65_000)).toBe('01:05');
    expect(formatDuration(192)).toBe('3 min 12 s');
    expect(formatDuration(0)).toBe('—');
    expect(displayContact({ contact: '51999888777' })).toBe('+51999888777');
    expect(displayContact({ contact: 'PE.ABC123456', contactName: ' ' })).toBe('PE.ABC123456');
  });
});
