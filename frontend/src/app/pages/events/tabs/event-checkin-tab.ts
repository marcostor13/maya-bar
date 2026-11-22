import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  LucideAngularModule,
  Check,
  Flashlight,
  ScanLine,
  Search,
  Undo2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { EventsApiService } from '../../../core/api/events-api.service';
import { Registration } from '../../../shared/models/event.model';
import { EventDetailStore } from '../event-detail.store';
import {
  ScanOutcome,
  groupLabel,
  matchesCheckin,
  outcomeFromError,
  outcomeFromResult,
  vibrationFor,
} from './checkin-logic';

const SOUND_KEY = 'maya.checkin.sound';
const UNDO_MS = 6000;
const RESULT_MS = 2000;

@Component({
  selector: 'app-event-checkin-tab',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="p-6 animate-fade-in">
      <div class="checkin-toolbar">
        <button type="button" class="btn btn-primary btn-lg checkin-scan-btn" (click)="openScanner()">
          <lucide-icon [img]="ScanLine" [size]="18" [strokeWidth]="2.5"></lucide-icon>
          Escanear entradas
        </button>
        <div class="stats-mini" aria-live="polite">
          <strong>{{ checkedInCount() }}</strong> / {{ totalAttendees() }} personas presentes
        </div>
      </div>

      <div class="search-box">
        <lucide-icon [img]="Search" [size]="18"></lucide-icon>
        <input type="search" class="input" placeholder="Buscar por nombre, email, teléfono o ticket"
          aria-label="Buscar invitado" enterkeyhint="search"
          [value]="search()" (input)="search.set($any($event.target).value)" />
      </div>

      @if (list().length === 0) {
        <div class="regs-empty">
          <lucide-icon [img]="Search" [size]="48" [strokeWidth]="1.5"></lucide-icon>
          <p>{{ search() ? 'No se encontraron invitados con ese criterio.' : 'Aún no hay registros confirmados.' }}</p>
        </div>
      } @else {
        <div class="checkin-list">
          @for (r of list(); track r._id) {
            <div class="checkin-card" [class.is-checked]="r.checkedIn">
              <div class="checkin-info">
                <strong>{{ r.name }}</strong>
                <div class="checkin-meta">
                  @if (r.partySize > 1) {
                    <span class="chip-group"><lucide-icon [img]="Users" [size]="12"></lucide-icon> {{ groupLabel(r.partySize) }}</span>
                  }
                  <code class="ticket-code-sm">{{ r.ticketCode }}</code>
                  <span>{{ r.impulsadorName || 'Directo' }}</span>
                </div>
              </div>
              <div class="checkin-action">
                @if (r.checkedIn) {
                  <div class="checked-label">
                    <lucide-icon [img]="Check" [size]="16" [strokeWidth]="3"></lucide-icon>
                    Ingresó
                  </div>
                } @else {
                  <button type="button" class="btn btn-primary" (click)="doCheckIn(r)" [disabled]="checkingInId() === r._id">
                    {{ checkingInId() === r._id ? 'Registrando...' : 'Dar ingreso' }}
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>

    <!-- ── Deshacer el último ingreso ── -->
    @if (undo(); as u) {
      <div class="undo-bar" role="status">
        <span>Ingreso de <strong>{{ u.name }}</strong> registrado</span>
        <button type="button" class="btn btn-secondary btn-sm" (click)="undoLast()" [disabled]="undoing()">
          <lucide-icon [img]="Undo2" [size]="14"></lucide-icon>
          Deshacer
        </button>
      </div>
    }

    <!-- ── Escáner a pantalla completa ── -->
    @if (scannerOpen()) {
      <div class="scanner-screen" role="dialog" aria-modal="true" aria-label="Escanear entradas">
        <div class="scanner-top">
          <div class="scanner-count"><strong>{{ checkedInCount() }}</strong> / {{ totalAttendees() }} presentes</div>
          <div class="scanner-tools">
            @if (torchAvailable()) {
              <button type="button" class="scanner-btn" [class.on]="torchOn()" (click)="toggleTorch()"
                [attr.aria-pressed]="torchOn()" aria-label="Linterna">
                <lucide-icon [img]="Flashlight" [size]="20"></lucide-icon>
              </button>
            }
            <button type="button" class="scanner-btn" (click)="toggleSound()" [attr.aria-pressed]="soundOn()"
              [attr.aria-label]="soundOn() ? 'Silenciar pitido' : 'Activar pitido'">
              <lucide-icon [img]="soundOn() ? Volume2 : VolumeX" [size]="20"></lucide-icon>
            </button>
            <button type="button" class="scanner-btn" (click)="closeScanner()" aria-label="Cerrar escáner">
              <lucide-icon [img]="X" [size]="22" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>
        </div>

        <div id="qr-reader" class="qr-reader"></div>

        @if (result(); as res) {
          <div class="scan-result" [class]="'scan-result ' + res.kind" role="alert">
            <lucide-icon [img]="res.kind === 'error' ? X : Check" [size]="36" [strokeWidth]="3"></lucide-icon>
            <div>
              <strong>{{ res.title }}</strong>
              <span>{{ res.detail }}</span>
            </div>
          </div>
        } @else {
          <p class="scanner-hint">Apunta la cámara al QR de la entrada. Puedes leer una tras otra.</p>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .p-6 { padding: 24px; }

    .regs-empty { padding:64px 40px; text-align:center; color:var(--color-text-muted); display:flex; flex-direction:column; align-items:center; gap:16px; background:var(--color-bg-app); border-radius:16px; border:1px dashed var(--color-border); }

    .checkin-toolbar { display:flex; align-items:center; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
    .stats-mini { font-size:14px; color:var(--color-text-muted); }
    .stats-mini strong { color:var(--color-brand); font-size:20px; }
    .search-box { position:relative; display:flex; align-items:center; margin-bottom:20px; }
    .search-box lucide-icon { position:absolute; left:16px; color:var(--color-text-muted); pointer-events:none; }
    .search-box .input { width:100%; padding-left:46px; }

    .checkin-list { display:flex; flex-direction:column; gap:12px; }
    .checkin-card { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px; background:var(--color-white); border:1px solid var(--color-border); border-radius:16px; }
    .checkin-card.is-checked { background:var(--color-bg-light); }
    .checkin-info { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .checkin-info strong { font-size:16px; color:var(--color-text-main); }
    .checkin-meta { display:flex; align-items:center; flex-wrap:wrap; gap:8px; font-size:13px; color:var(--color-text-muted); }
    .chip-group { display:inline-flex; align-items:center; gap:4px; font-weight:700; color:var(--color-text-main); background:var(--color-bg-app); border:1px solid var(--color-border); padding:2px 8px; border-radius:var(--radius-pill); }
    .ticket-code-sm { font-family:monospace; font-weight:700; color:var(--color-brand); }
    .checked-label { display:flex; align-items:center; gap:6px; color:var(--color-success); font-weight:700; font-size:14px; }

    .undo-bar {
      position: fixed; z-index: 110; left: 16px; right: 16px;
      bottom: calc(16px + var(--bottom-nav-height) + var(--safe-bottom));
      max-width: 480px; margin: 0 auto;
      display:flex; align-items:center; justify-content:space-between; gap:12px;
      padding: 12px 16px; background: var(--color-text-main); color: var(--color-white);
      border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); font-size: 14px;
    }

    /* ── Escáner ── */
    .scanner-screen {
      position: fixed; inset: 0; z-index: 130;
      height: 100vh; height: 100dvh;
      display: flex; flex-direction: column;
      background: var(--color-text-main); color: var(--color-white);
      padding: calc(12px + var(--safe-top)) calc(12px + var(--safe-right)) calc(16px + var(--safe-bottom)) calc(12px + var(--safe-left));
      box-sizing: border-box;
    }
    .scanner-top { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .scanner-count { font-size:15px; }
    .scanner-count strong { font-size:22px; }
    .scanner-tools { display:flex; gap:8px; }
    .scanner-btn { width:48px; height:48px; border-radius:50%; border:none; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.14); color:var(--color-white); cursor:pointer; }
    .scanner-btn.on { background:var(--color-warning); color:var(--color-text-main); }
    .qr-reader { flex:1; min-height:0; width:100%; border-radius:20px; overflow:hidden; background:#000; }
    .scanner-hint { text-align:center; opacity:.8; font-size:14px; margin:16px 0 0; }
    .scan-result { display:flex; align-items:center; gap:16px; margin-top:16px; padding:18px 20px; border-radius:20px; color:var(--color-white); }
    .scan-result.ok { background:var(--color-success); }
    .scan-result.already { background:var(--color-warning); color:var(--color-text-main); }
    .scan-result.error { background:var(--color-error); }
    .scan-result div { display:flex; flex-direction:column; gap:4px; }
    .scan-result strong { font-size:20px; line-height:1.2; }
    .scan-result span { font-size:15px; }

    @media (hover: hover) { .checkin-card:hover { border-color: var(--color-brand); } }

    @media (max-width: 768px) {
      .p-6 { padding: 16px; }
      .checkin-toolbar { flex-direction: column; align-items: stretch; gap: 10px; }
      .checkin-scan-btn { justify-content: center; }
      .stats-mini { text-align: center; }
      .checkin-card { flex-wrap: wrap; padding: 14px; }
      .checkin-action { width: 100%; }
      .checkin-action .btn { width: 100%; justify-content: center; }
    }
  `],
})
export class EventCheckinTabComponent implements OnDestroy {
  private store = inject(EventDetailStore);
  private api = inject(EventsApiService);
  private toast = inject(ToastService);

  readonly Check = Check; readonly ScanLine = ScanLine; readonly Search = Search; readonly X = X;
  readonly Users = Users; readonly Undo2 = Undo2; readonly Flashlight = Flashlight;
  readonly Volume2 = Volume2; readonly VolumeX = VolumeX;
  readonly groupLabel = groupLabel;

  checkedInCount = this.store.checkedInCount;
  totalAttendees = this.store.totalAttendees;

  /** Búsqueda propia: no depende de los filtros de Asistentes (HU30). */
  search = signal('');
  list = computed(() => this.store.confirmedRegistrations().filter(r => matchesCheckin(r, this.search())));

  checkingInId = signal<string | null>(null);
  undo = signal<Registration | null>(null);
  undoing = signal(false);
  private undoTimer: ReturnType<typeof setTimeout> | null = null;

  // Escáner
  scannerOpen = signal(false);
  result = signal<ScanOutcome | null>(null);
  torchAvailable = signal(false);
  torchOn = signal(false);
  soundOn = signal(this.readSound());
  private html5Qrcode: import('html5-qrcode').Html5Qrcode | null = null;
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private scanLocked = false;

  doCheckIn(reg: Registration) {
    const id = this.store.eventId();
    if (!id) return;
    this.checkingInId.set(reg._id);
    this.api.checkIn(id, reg._id).subscribe({
      next: (updated) => {
        this.store.applyRegistration(updated);
        this.toast.success(`Ingreso de ${reg.name} registrado`);
        this.offerUndo(updated);
        this.checkingInId.set(null);
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'No se pudo registrar el ingreso');
        this.checkingInId.set(null);
      },
    });
  }

  private offerUndo(reg: Registration) {
    this.undo.set(reg);
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoTimer = setTimeout(() => this.undo.set(null), UNDO_MS);
  }

  undoLast() {
    const reg = this.undo();
    const id = this.store.eventId();
    if (!reg || !id) return;
    this.undoing.set(true);
    this.api.undoCheckIn(id, reg._id).subscribe({
      next: (updated) => {
        this.store.applyRegistration(updated);
        this.toast.success(`Se quitó el ingreso de ${reg.name}`);
        this.undo.set(null);
        this.undoing.set(false);
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'No se pudo deshacer');
        this.undoing.set(false);
      },
    });
  }

  // ── Escáner ──────────────────────────────────────────────────────────────

  async openScanner() {
    this.result.set(null);
    this.scannerOpen.set(true);
    const { Html5Qrcode } = await import('html5-qrcode');
    setTimeout(async () => {
      try {
        this.html5Qrcode = new Html5Qrcode('qr-reader');
        await this.html5Qrcode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            // Caja de lectura proporcional a la pantalla, no fija en 250 px.
            qrbox: (w: number, h: number) => {
              const side = Math.max(160, Math.floor(Math.min(w, h) * 0.7));
              return { width: side, height: side };
            },
          },
          (decodedText) => void this.onQrDecoded(decodedText),
          () => { /* errores de decodificación por cuadro: normales */ },
        );
        this.detectTorch();
      } catch {
        this.toast.error('No se pudo acceder a la cámara');
      }
    });
  }

  private detectTorch() {
    try {
      const caps = this.html5Qrcode?.getRunningTrackCapabilities() as { torch?: boolean } | undefined;
      this.torchAvailable.set(!!caps?.torch);
    } catch {
      this.torchAvailable.set(false);
    }
  }

  async toggleTorch() {
    const next = !this.torchOn();
    try {
      await this.html5Qrcode?.applyVideoConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      this.torchOn.set(next);
    } catch {
      this.toast.error('No se pudo usar la linterna');
    }
  }

  toggleSound() {
    const next = !this.soundOn();
    this.soundOn.set(next);
    try { localStorage.setItem(SOUND_KEY, next ? '1' : '0'); } catch { /* sin almacenamiento */ }
  }

  private readSound(): boolean {
    try { return localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; }
  }

  async closeScanner() {
    if (this.html5Qrcode) {
      try { await this.html5Qrcode.stop(); this.html5Qrcode.clear(); } catch { /* ya parado */ }
      this.html5Qrcode = null;
    }
    this.torchOn.set(false);
    this.scannerOpen.set(false);
  }

  /** Público para las pruebas: procesa una lectura y deja el escáner abierto. */
  async onQrDecoded(code: string) {
    if (this.scanLocked) return;
    const id = this.store.eventId();
    if (!id) return;
    this.scanLocked = true;
    let outcome: ScanOutcome;
    try {
      const res = await firstValueFrom(this.api.checkInByCode(id, code));
      this.store.applyRegistration(res);
      outcome = outcomeFromResult(res);
      if (outcome.kind === 'ok') this.offerUndo(res);
    } catch (err: unknown) {
      outcome = outcomeFromError(err);
    }
    this.showResult(outcome);
    setTimeout(() => { this.scanLocked = false; }, RESULT_MS);
  }

  private showResult(outcome: ScanOutcome) {
    this.result.set(outcome);
    try { navigator.vibrate?.(vibrationFor(outcome.kind)); } catch { /* sin vibración */ }
    if (this.soundOn()) this.beep(outcome.kind === 'error' ? 220 : 880);
    if (this.resultTimer) clearTimeout(this.resultTimer);
    this.resultTimer = setTimeout(() => this.result.set(null), RESULT_MS);
  }

  private beep(freq: number) {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      osc.onended = () => void ctx.close();
    } catch { /* sin audio */ }
  }

  @HostListener('document:keydown.escape')
  onEsc() { if (this.scannerOpen()) void this.closeScanner(); }

  ngOnDestroy() {
    if (this.undoTimer) clearTimeout(this.undoTimer);
    if (this.resultTimer) clearTimeout(this.resultTimer);
    void this.closeScanner();
  }
}
