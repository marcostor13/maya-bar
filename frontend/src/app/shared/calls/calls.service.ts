import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConversationsRealtimeService, type CallEvent } from '../conversations-realtime';
import { ToastService } from '../toast';
import { PermissionsService } from '../../auth/permissions.service';
import { environment } from '../../../environments/environment';
import {
  CALL_MEDIA,
  CallOptions,
  CallView,
  CurrentCall,
  clock,
} from './calls.models';

const API = `${environment.apiUrl}/calls`;
/** La API de Meta no admite trickle ICE: se espera a reunir candidatos. */
const ICE_GATHER_MS = 3000;

export const MIC_DENIED =
  'No pudimos usar tu micrófono. Permite el acceso desde el candado de la barra de direcciones ' +
  '(en el móvil: Ajustes › Apps › Maya › Permisos › Micrófono) y vuelve a aceptar la llamada.';
export const MIC_MISSING = 'No encontramos ningún micrófono conectado a este equipo.';
export const MIC_BUSY = 'Otro programa está usando el micrófono. Ciérralo y vuelve a intentarlo.';
export const MIC_UNSUPPORTED =
  'Este navegador no permite llamadas. Usa Chrome, Edge, Firefox o Safari actualizados.';

/** A quién llamar desde la ficha, el chat o el historial. */
export interface CallTarget {
  contact: string;
  contactName?: string;
  accountId?: string;
}

/**
 * Llamadas de WhatsApp en el navegador: avisos entrantes, audio WebRTC directo
 * con Meta (ADR 0002), silenciar, colgar y cronómetro. Uno para toda la app.
 */
@Injectable({ providedIn: 'root' })
export class CallsService {
  private http = inject(HttpClient);
  private realtime = inject(ConversationsRealtimeService);
  private toast = inject(ToastService);
  private permissions = inject(PermissionsService);
  private media = inject(CALL_MEDIA);

  /** Entrantes sonando que puedo atender (la primera es la que se muestra). */
  readonly incoming = signal<CallView[]>([]);
  readonly current = signal<CurrentCall | null>(null);
  readonly micError = signal<string | null>(null);
  readonly busy = signal(false);
  /** Diálogo "Llamar" abierto (permiso + llamar). */
  readonly dialog = signal<CallTarget | null>(null);

  private readonly now = signal(Date.now());
  readonly elapsed = computed(() => {
    const since = this.current()?.since;
    return since ? clock(this.now() - since) : '';
  });

  private started = false;
  private options: Promise<CallOptions> | null = null;
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  /** Escucha los eventos del socket. Idempotente; lo llama el shell. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.realtime.call$.subscribe((e) => this.onEvent(e));
  }

  available(): boolean {
    return this.permissions.can('calls');
  }

  loadOptions(): Promise<CallOptions> {
    this.options ??= firstValueFrom(this.http.get<CallOptions>(`${API}/options`)).catch((err) => {
      this.options = null;
      throw err;
    });
    return this.options;
  }

  open(target: CallTarget): void {
    this.dialog.set(target);
  }

  onEvent({ event, payload }: CallEvent): void {
    const id = String(payload['id'] ?? '');
    switch (event) {
      case 'call:incoming': {
        const call = payload['call'] as CallView;
        if (!call || this.current()?.call._id === call._id) return;
        this.incoming.update((list) => [...list.filter((c) => c._id !== call._id), call]);
        break;
      }
      case 'call:taken':
        this.dropIncoming(id);
        break;
      case 'call:ended':
        this.dropIncoming(id);
        if (this.current()?.call._id === id) this.finish(String(payload['status'] ?? ''));
        break;
      case 'call:answer':
        if (this.current()?.call._id === id && this.pc)
          void this.pc
            .setRemoteDescription({ type: 'answer', sdp: String(payload['sdp'] ?? '') })
            .catch(() => this.failActive('No se pudo conectar el audio'));
        break;
      case 'call:updated': {
        const call = payload['call'] as CallView;
        const cur = this.current();
        if (cur && call && cur.call._id === call._id && call.status === 'active')
          this.setActive({ ...cur, call });
        break;
      }
    }
  }

  /** Atender: micrófono primero, y solo entonces se reserva la llamada. */
  async accept(call: CallView): Promise<void> {
    if (!this.canStart()) return;
    const stream = await this.microphone();
    if (!stream) return;
    this.busy.set(true);
    let claimed = false;
    try {
      const { offerSdp } = await firstValueFrom(
        this.http.post<{ offerSdp: string }>(`${API}/${call._id}/claim`, {}),
      );
      claimed = true;
      this.dropIncoming(call._id);
      this.current.set({ call, phase: 'connecting', muted: false });
      const { iceServers } = await this.loadOptions();
      const pc = this.peer(stream, iceServers);
      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
      await pc.setLocalDescription(await pc.createAnswer());
      const sdp = await this.gathered(pc);
      const answered = await firstValueFrom(
        this.http.post<CallView>(`${API}/${call._id}/accept`, { sdp }),
      );
      this.setActive({ call: answered, phase: 'active', muted: false });
    } catch (err) {
      if (claimed && this.current()?.call._id === call._id)
        this.http.post(`${API}/${call._id}/release`, {}).subscribe({ error: () => undefined });
      if (err instanceof HttpErrorResponse && err.status === 409) this.dropIncoming(call._id);
      this.cleanup();
      this.current.set(null);
      this.toast.error(this.messageOf(err, 'No se pudo atender la llamada'));
    } finally {
      this.busy.set(false);
    }
  }

  async reject(call: CallView): Promise<void> {
    this.dropIncoming(call._id);
    try {
      await firstValueFrom(this.http.post(`${API}/${call._id}/reject`, {}));
    } catch (err) {
      this.toast.error(this.messageOf(err, 'No se pudo rechazar la llamada'));
    }
  }

  /** Llamar a un cliente que ya dio permiso. */
  async call(accountId: string, contact: string): Promise<boolean> {
    if (!this.canStart()) return false;
    const stream = await this.microphone();
    if (!stream) return false;
    this.busy.set(true);
    try {
      const { iceServers } = await this.loadOptions();
      const pc = this.peer(stream, iceServers);
      await pc.setLocalDescription(await pc.createOffer());
      const sdp = await this.gathered(pc);
      const call = await firstValueFrom(
        this.http.post<CallView>(`${API}/outbound`, { accountId, contact, sdp }),
      );
      this.current.set({ call, phase: 'calling', muted: false });
      return true;
    } catch (err) {
      this.cleanup();
      this.current.set(null);
      this.toast.error(this.messageOf(err, 'No se pudo iniciar la llamada'));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async hangup(): Promise<void> {
    const cur = this.current();
    if (!cur) return;
    this.cleanup();
    this.current.set(null);
    try {
      await firstValueFrom(this.http.post(`${API}/${cur.call._id}/hangup`, {}));
    } catch (err) {
      this.toast.error(this.messageOf(err, 'No se pudo colgar en WhatsApp'));
    }
  }

  toggleMute(): void {
    const cur = this.current();
    if (!cur) return;
    const muted = !cur.muted;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.current.set({ ...cur, muted });
  }

  dismissMicError(): void {
    this.micError.set(null);
  }

  // ------------------------------------------------------------------

  private canStart(): boolean {
    if (this.current() || this.busy()) {
      this.toast.warning('Ya tienes una llamada en curso');
      return false;
    }
    if (!this.media.supported()) {
      this.micError.set(MIC_UNSUPPORTED);
      return false;
    }
    return true;
  }

  private async microphone(): Promise<MediaStream | null> {
    try {
      this.stream = await this.media.getMicrophone();
      return this.stream;
    } catch (err) {
      const name = (err as { name?: string })?.name;
      this.micError.set(
        name === 'NotFoundError' || name === 'OverconstrainedError'
          ? MIC_MISSING
          : name === 'NotReadableError'
            ? MIC_BUSY
            : MIC_DENIED,
      );
      return null;
    }
  }

  private peer(stream: MediaStream, iceServers: RTCIceServer[]): RTCPeerConnection {
    const pc = this.media.createPeer(iceServers);
    this.pc = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => this.play(e.streams[0]);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.failActive('Se perdió la conexión de audio');
    };
    return pc;
  }

  private play(remote?: MediaStream): void {
    if (!remote || typeof Audio === 'undefined') return;
    this.audio ??= new Audio();
    this.audio.autoplay = true;
    this.audio.srcObject = remote;
    void this.audio.play().catch(() => undefined);
  }

  /** Espera a tener los candidatos ICE (máximo 3 s) y devuelve el SDP completo. */
  private gathered(pc: RTCPeerConnection): Promise<string> {
    return new Promise((resolve) => {
      const done = () => resolve(pc.localDescription?.sdp ?? '');
      if (pc.iceGatheringState === 'complete') return done();
      const timer = setTimeout(done, ICE_GATHER_MS);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          done();
        }
      };
    });
  }

  private setActive(cur: CurrentCall): void {
    this.current.set({ ...cur, phase: 'active', since: cur.since ?? Date.now() });
    this.now.set(Date.now());
    this.ticker ??= setInterval(() => this.now.set(Date.now()), 1000);
  }

  private failActive(message: string): void {
    if (!this.current()) return;
    this.toast.error(message);
    void this.hangup();
  }

  /** Terminó por el otro lado (o Meta): se suelta todo y se avisa. */
  private finish(status: string): void {
    const cur = this.current();
    this.cleanup();
    this.current.set(null);
    if (!cur) return;
    if (status === 'completed') this.toast.info('Llamada terminada');
    else if (status === 'rejected' && cur.call.direction === 'outbound')
      this.toast.warning('El cliente rechazó la llamada');
    else if (status === 'missed' && cur.call.direction === 'outbound')
      this.toast.warning('El cliente no contestó');
    else if (status === 'failed') this.toast.error('La llamada falló');
    else this.toast.info('La llamada terminó');
  }

  private dropIncoming(id: string): void {
    this.incoming.update((list) => list.filter((c) => c._id !== id));
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
    }
    this.pc = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
    }
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private messageOf(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const msg = (err.error as { message?: unknown } | null)?.message;
      if (typeof msg === 'string') return msg;
      if (Array.isArray(msg)) return msg.join('. ');
    }
    return fallback;
  }
}
