import { Component, ElementRef, Injector, OnDestroy, afterNextRender, computed, effect, inject, viewChild } from '@angular/core';
import { LucideAngularModule, Phone, PhoneOff, Mic, MicOff, PhoneIncoming, PhoneOutgoing, X } from 'lucide-angular';
import { CallsService } from './calls.service';
import { CallDialogComponent } from './call-dialog';
import { displayContact } from './calls.models';

/**
 * Timbre sencillo con Web Audio (sin archivos): dos pitidos cada 2 s. Si el
 * navegador no deja sonar (sin interacción previa) simplemente no suena.
 */
class Ringer {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer || typeof AudioContext === 'undefined') return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const beep = (at: number) => {
      const ctx = this.ctx!;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 480;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.35);
    };
    const ring = () => { beep(0); beep(0.5); };
    ring();
    this.timer = setInterval(ring, 2000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}

/** Aviso de llamada entrante, panel de la llamada en curso y diálogos de llamadas. */
@Component({
  selector: 'app-call-overlay',
  standalone: true,
  imports: [LucideAngularModule, CallDialogComponent],
  template: `
    @if (calls.current(); as cur) {
      <section class="call-card active" role="region" aria-label="Llamada en curso">
        <div class="who">
          <span class="avatar" aria-hidden="true">
            <lucide-icon [img]="cur.call.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing" [size]="18" />
          </span>
          <div class="who-text">
            <strong>{{ show(cur.call) }}</strong>
            <span class="state" aria-live="polite">
              @switch (cur.phase) {
                @case ('connecting') { Conectando el audio… }
                @case ('calling') { Llamando… }
                @default { En llamada · <span class="timer">{{ calls.elapsed() }}</span> }
              }
            </span>
          </div>
        </div>
        <div class="controls">
          <button type="button" class="btn btn-secondary btn-icon round" [attr.aria-pressed]="cur.muted"
                  [attr.aria-label]="cur.muted ? 'Activar micrófono' : 'Silenciar micrófono'"
                  [disabled]="cur.phase === 'connecting'" (click)="calls.toggleMute()">
            <lucide-icon [img]="cur.muted ? MicOff : Mic" [size]="18" />
          </button>
          <button type="button" class="btn btn-danger btn-icon round" aria-label="Colgar" (click)="calls.hangup()">
            <lucide-icon [img]="PhoneOff" [size]="18" />
          </button>
        </div>
      </section>
    } @else if (ringing(); as inc) {
      <section #ring class="call-card ringing" role="alertdialog" aria-modal="false"
               aria-labelledby="call-ring-title" aria-describedby="call-ring-desc">
        <div class="who">
          <span class="avatar pulse" aria-hidden="true"><lucide-icon [img]="PhoneIncoming" [size]="18" /></span>
          <div class="who-text">
            <strong id="call-ring-title">{{ show(inc) }}</strong>
            <span id="call-ring-desc" class="state">
              Llamada de WhatsApp · {{ inc.accountLabel || 'WhatsApp' }}
              @if (others() > 0) { · {{ others() }} más en espera }
            </span>
          </div>
        </div>
        <div class="controls">
          <button type="button" class="btn btn-danger btn-sm" [disabled]="calls.busy()" (click)="calls.reject(inc)">
            <lucide-icon [img]="PhoneOff" [size]="15" /> Rechazar
          </button>
          <button type="button" class="btn btn-primary btn-sm accept" [disabled]="calls.busy()" (click)="calls.accept(inc)">
            <lucide-icon [img]="Phone" [size]="15" /> {{ calls.busy() ? 'Conectando…' : 'Aceptar' }}
          </button>
        </div>
      </section>
    }

    @if (calls.micError(); as msg) {
      <div class="mic-overlay" (click)="calls.dismissMicError()">
        <div class="mic-modal" role="alertdialog" aria-modal="true" aria-labelledby="mic-title" aria-describedby="mic-desc"
             (click)="$event.stopPropagation()" (keydown.escape)="calls.dismissMicError()">
          <div class="mic-head">
            <h2 id="mic-title"><lucide-icon [img]="MicOff" [size]="18" /> Micrófono no disponible</h2>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Cerrar" (click)="calls.dismissMicError()">
              <lucide-icon [img]="X" [size]="16" />
            </button>
          </div>
          <p id="mic-desc">{{ msg }}</p>
          <div class="mic-actions">
            <button type="button" class="btn btn-primary" (click)="calls.dismissMicError()">Entendido</button>
          </div>
        </div>
      </div>
    }

    @if (calls.dialog(); as target) {
      <app-call-dialog [target]="target" (closed)="calls.dialog.set(null)" />
    }
  `,
  styles: [`
    .call-card { position: fixed; top: 20px; right: 24px; z-index: 125; width: min(380px, calc(100% - 32px));
      background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
      padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; border: 1.5px solid var(--color-border);
      animation: slide-in .25s var(--transition-spring, ease-out); }
    .call-card.ringing { border-color: var(--color-brand); }
    .who { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0;
      background: var(--color-brand-light); color: var(--color-brand); }
    .avatar.pulse { animation: pulse 1.2s ease-in-out infinite; }
    .who-text { display: flex; flex-direction: column; min-width: 0; }
    .who-text strong { font-size: 15px; color: var(--color-text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .state { font-size: 13px; color: var(--color-text-muted); }
    .timer { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--color-text-main); }
    .controls { display: flex; justify-content: flex-end; gap: 10px; }
    .controls .btn { display: inline-flex; align-items: center; gap: 6px; }
    .round { width: 44px; height: 44px; border-radius: 50%; }
    .mic-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 135; }
    .mic-modal { background: var(--color-white); border-radius: var(--radius-lg); width: calc(100% - 48px);
      max-width: 480px; padding: 28px 32px; box-shadow: var(--shadow-lg); }
    .mic-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .mic-head h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-family: var(--font-heading);
      font-size: 18px; color: var(--color-text-main); }
    .mic-modal p { font-size: 14px; line-height: 1.55; color: var(--color-text-main); margin: 0; }
    .mic-actions { display: flex; justify-content: flex-end; margin-top: 20px; }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
    @keyframes slide-in { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: none; } }
    @media (max-width: 640px) {
      .call-card { top: 12px; left: 16px; right: 16px; width: auto; }
      .controls .btn-sm { flex: 1; justify-content: center; min-height: 44px; }
      .mic-modal { padding: 22px 20px; }
    }
    @media (prefers-reduced-motion: reduce) { .call-card, .avatar.pulse { animation: none; } }
  `],
})
export class CallOverlayComponent implements OnDestroy {
  readonly calls = inject(CallsService);
  private injector = inject(Injector);
  private readonly ringEl = viewChild<ElementRef<HTMLElement>>('ring');
  private readonly ringer = new Ringer();

  readonly Phone = Phone;
  readonly PhoneOff = PhoneOff;
  readonly PhoneIncoming = PhoneIncoming;
  readonly PhoneOutgoing = PhoneOutgoing;
  readonly Mic = Mic;
  readonly MicOff = MicOff;
  readonly X = X;

  /** La primera entrante sonando, si no estoy ya en una llamada. */
  readonly ringing = computed(() => (this.calls.current() ? null : (this.calls.incoming()[0] ?? null)));
  readonly others = computed(() => Math.max(0, this.calls.incoming().length - 1));

  constructor() {
    this.calls.start();
    // Al llegar una llamada nueva, el foco va a "Aceptar" y suena el timbre.
    effect(() => {
      const id = this.ringing()?._id;
      if (!id) {
        this.ringer.stop();
        return;
      }
      this.ringer.start();
      afterNextRender(() => this.ringEl()?.nativeElement.querySelector<HTMLButtonElement>('.accept')?.focus(), {
        injector: this.injector,
      });
    });
  }

  ngOnDestroy(): void {
    this.ringer.stop();
  }

  show(c: { contact: string; contactName?: string }): string {
    return displayContact(c);
  }
}
