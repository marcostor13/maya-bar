import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule, Sparkles, CalendarClock, ChevronDown, ArrowLeft, CheckCircle2, Clock,
  Send, XCircle, AlertTriangle, MessagesSquare, Info, Layers, RotateCcw,
} from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { ConfirmService } from '../../../shared/confirm';
import { RecoveryApiService } from '../../../core/api/recovery-api.service';
import {
  PRICE_PER_MESSAGE_USD, RecoveryPlan, RecoverySegment, SegmentSchedule, sendCounts,
} from '../../../shared/models/recovery.model';
import { RECOVERY_SHARED_STYLES } from '../recovery.styles';

interface Row {
  key: string;
  enabled: boolean;
  date: string;
  time: string;
  firstBatchSize: number;
  firstPauseMinutes: number;
  batchSize: number;
  batchIntervalMinutes: number;
}

@Component({
  selector: 'app-recovery-schedule-step',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
  template: `
    @if (inProgress()) {
      <!-- Seguimiento del envío -->
      <div class="panel hero" [class.hero-done]="plan().status === 'done'">
        <span class="hero-icon">
          <lucide-icon [img]="plan().status === 'done' ? CheckCircle2 : plan().status === 'sending' ? Send : CalendarClock" [size]="28"></lucide-icon>
        </span>
        <div>
          <h2 class="panel-title">{{ heroTitle() }}</h2>
          <p class="panel-sub">{{ heroText() }}</p>
        </div>
      </div>

      @for (s of tracked(); track s.key) {
        @let c = counts(s);
        <div class="panel seg" [style.--seg]="s.color">
          <div class="seg-head">
            <span class="dot" [style.background]="s.color"></span>
            <span class="seg-name">{{ s.name }}</span>
            <span class="status-pill" [class]="'status-pill st-' + s.sendStatus">{{ statusLabel(s) }}</span>
          </div>

          <div class="progress big" [attr.aria-label]="c.sent + ' enviados de ' + s.recipients.length">
            <span [style.width.%]="pct(c.sent, s)" style="background:var(--color-success)"></span>
            <span [style.width.%]="pct(c.failed, s)" style="background:var(--color-error)"></span>
            <span [style.width.%]="pct(c.skipped, s)" style="background:#CBD5E1"></span>
          </div>
          <div class="legend">
            <span><b>{{ c.sent }}</b> enviados</span>
            @if (c.failed) { <span class="bad"><b>{{ c.failed }}</b> fallidos</span> }
            @if (c.skipped) { <span><b>{{ c.skipped }}</b> omitidos</span> }
            <span><b>{{ c.pending }}</b> pendientes</span>
            <span class="spacer"></span>
            @if (s.sendStatus === 'scheduled' && s.sendAt) { <span>Empieza {{ formatDateTime(s.sendAt) }}</span> }
            @if (s.sendStatus === 'sending' && s.nextBatchAt) { <span>Próxima tanda {{ formatTime(s.nextBatchAt) }}</span> }
          </div>

          @if (s.sendError) {
            <div class="alert" [class.alert-warning]="s.sendStatus !== 'paused'" [class.alert-danger]="s.sendStatus === 'paused'">
              <lucide-icon [img]="s.sendStatus === 'paused' ? AlertTriangle : Clock" [size]="16"></lucide-icon>
              <span>{{ s.sendError }}</span>
            </div>
          }

          @if (c.failed) {
            <button class="link-btn" (click)="toggleFailures(s.key)">
              <lucide-icon [img]="ChevronDown" [size]="14" [class.rot]="openFailures() === s.key"></lucide-icon>
              Ver fallidos
            </button>
            @if (openFailures() === s.key) {
              <div class="failures">
                @for (r of failedOf(s); track r.conversationId) {
                  <div class="failure"><b>{{ r.name || r.phone }}</b><span>{{ r.error }}</span></div>
                }
              </div>
            }
          }
        </div>
      }

      <div class="footer-bar">
        <a class="btn btn-ghost" routerLink="/inbox">
          <lucide-icon [img]="MessagesSquare" [size]="16"></lucide-icon> Ver respuestas en Conversaciones
        </a>
        <span class="spacer"></span>
        @if (plan().status !== 'done') {
          <button class="btn btn-secondary" [disabled]="busy()" (click)="cancel()">
            <lucide-icon [img]="XCircle" [size]="16"></lucide-icon> Detener y editar
          </button>
        }
      </div>
    } @else {
      <!-- Programación -->
      <div class="panel">
        <h2 class="panel-title">¿Cuándo lo enviamos?</h2>
        <p class="panel-sub">Te proponemos día y hora según cuándo te escriben tus clientes. Cámbialo si lo prefieres.</p>
        @if (tzNote()) {
          <div class="alert alert-info" style="margin-top:14px">
            <lucide-icon [img]="Info" [size]="16"></lucide-icon><span>{{ tzNote() }}</span>
          </div>
        }
      </div>

      @for (row of rows(); track row.key) {
        @let s = segmentOf(row.key)!;
        <div class="panel seg" [class.off]="!row.enabled" [style.--seg]="s.color">
          <div class="seg-head">
            <span class="dot" [style.background]="s.color"></span>
            <div class="seg-title">
              <span class="seg-name">{{ s.name }}</span>
              <span class="seg-meta">{{ pendingOf(s) }} personas · {{ templateLabel(s) }}</span>
            </div>
            <label class="switch" [title]="row.enabled ? 'Se enviará' : 'No se enviará'">
              <input type="checkbox" [checked]="row.enabled" (change)="update(row.key, { enabled: $any($event.target).checked })"
                [attr.aria-label]="'Programar ' + s.name" />
              <span class="track"></span>
            </label>
          </div>

          @if (row.enabled) {
            @if (s.recommendedAt) {
              <div class="reco">
                <lucide-icon [img]="Sparkles" [size]="16"></lucide-icon>
                <div class="reco-text">
                  <b>Recomendado: {{ formatDateTime(s.recommendedAt) }}</b>
                  <span>{{ s.recommendationReason }}</span>
                </div>
                @if (!isRecommended(row, s)) {
                  <button class="btn btn-ghost btn-sm" (click)="useRecommendation(row.key)">
                    <lucide-icon [img]="RotateCcw" [size]="13"></lucide-icon> Usar
                  </button>
                }
              </div>
            }

            <div class="when">
              <div class="field">
                <label class="label" [for]="'d-' + row.key">Día</label>
                <input class="input" type="date" [id]="'d-' + row.key" [min]="today" [ngModel]="row.date"
                  (ngModelChange)="update(row.key, { date: $event })" />
              </div>
              <div class="field">
                <label class="label" [for]="'t-' + row.key">Hora</label>
                <input class="input" type="time" [id]="'t-' + row.key" step="300" [ngModel]="row.time"
                  (ngModelChange)="update(row.key, { time: $event })" />
              </div>
              <div class="field ends">
                <span class="label">Termina aprox.</span>
                <span class="ends-value">{{ endsAt(row, s) }}</span>
              </div>
            </div>
            @if (warningOf(row); as w) {
              <span class="field-warn"><lucide-icon [img]="AlertTriangle" [size]="13"></lucide-icon> {{ w }}</span>
            }

            <button class="link-btn" (click)="toggleAdvanced(row.key)" [attr.aria-expanded]="openAdvanced() === row.key">
              <lucide-icon [img]="Layers" [size]="14"></lucide-icon>
              Envío por tandas: {{ row.firstBatchSize }}, pausa {{ row.firstPauseMinutes }} min, luego {{ row.batchSize }} cada {{ row.batchIntervalMinutes }} min
              <lucide-icon [img]="ChevronDown" [size]="14" [class.rot]="openAdvanced() === row.key"></lucide-icon>
            </button>
            @if (openAdvanced() === row.key) {
              <div class="advanced">
                <p class="hint">
                  Un número que de pronto envía muchas plantillas seguidas pierde calidad ante Meta y empieza a ser frenado.
                  Por eso se manda una primera tanda pequeña, se espera a ver entregas y bloqueos, y se sigue poco a poco.
                </p>
                <div class="adv-grid">
                  <div class="field"><label class="label">Primera tanda</label>
                    <input class="input" type="number" min="1" max="200" [ngModel]="row.firstBatchSize" (ngModelChange)="update(row.key, { firstBatchSize: +$event })" /></div>
                  <div class="field"><label class="label">Pausa después (min)</label>
                    <input class="input" type="number" min="1" max="240" [ngModel]="row.firstPauseMinutes" (ngModelChange)="update(row.key, { firstPauseMinutes: +$event })" /></div>
                  <div class="field"><label class="label">Siguientes tandas</label>
                    <input class="input" type="number" min="1" max="200" [ngModel]="row.batchSize" (ngModelChange)="update(row.key, { batchSize: +$event })" /></div>
                  <div class="field"><label class="label">Cada (min)</label>
                    <input class="input" type="number" min="1" max="240" [ngModel]="row.batchIntervalMinutes" (ngModelChange)="update(row.key, { batchIntervalMinutes: +$event })" /></div>
                </div>
              </div>
            }
          }
        </div>
      }

      <div class="panel total">
        <div class="total-item"><span class="total-n">{{ totalMessages() }}</span><span class="total-l">mensajes</span></div>
        <div class="total-item"><span class="total-n">~{{ '$' + totalCost() }}</span><span class="total-l">USD aprox. (tarifa de Meta)</span></div>
        <div class="total-item"><span class="total-n">{{ enabledCount() }}</span><span class="total-l">{{ enabledCount() === 1 ? 'segmento' : 'segmentos' }}</span></div>
      </div>

      <div class="footer-bar">
        <button class="btn btn-ghost" (click)="back.emit()">
          <lucide-icon [img]="ArrowLeft" [size]="16"></lucide-icon> Plantillas
        </button>
        <span class="spacer"></span>
        <button class="btn btn-primary btn-lg" [disabled]="busy() || !enabledCount()" (click)="submit()">
          <lucide-icon [img]="CalendarClock" [size]="18"></lucide-icon>
          {{ busy() ? 'Programando…' : 'Programar envío' }}
        </button>
      </div>
    }
  `,
  styles: [RECOVERY_SHARED_STYLES, `
    .hero { display: flex; gap: 18px; align-items: center; background: linear-gradient(135deg, #FFF0F3, #F5F3FF); box-shadow: none; }
    .hero-done { background: linear-gradient(135deg, #ECFDF5, #F0FDFA); }
    .hero-icon { width: 60px; height: 60px; border-radius: 20px; background: #fff; display: grid; place-items: center; color: var(--color-brand); box-shadow: var(--shadow-md); flex-shrink: 0; }
    .hero-done .hero-icon { color: var(--color-success); }

    .seg { position: relative; overflow: hidden; }
    .seg::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--seg); }
    .seg.off { opacity: .65; }
    .seg-head { display: flex; align-items: center; gap: 12px; }
    .seg-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .seg-name { font: 600 16px var(--font-heading); flex: 1; min-width: 0; }
    .seg-meta { font-size: 12px; color: var(--color-text-muted); }

    .reco { display: flex; align-items: center; gap: 12px; margin-top: 16px; padding: 12px 16px; background: #F5F3FF; color: #5B21B6; border-radius: var(--radius-md); }
    .reco lucide-icon { flex-shrink: 0; }
    .reco-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; line-height: 1.45; }
    .reco-text b { font-weight: 600; }

    .when { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 16px; align-items: end; }
    .ends { justify-content: flex-end; }
    .ends-value { font-size: 14px; font-weight: 600; padding: 12px 0; color: var(--color-text-main); }
    .field-warn { display: flex; gap: 6px; align-items: center; font-size: 12px; color: #B45309; margin-top: 8px; }

    .link-btn { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; border: 0; background: none; padding: 4px 0; font: 500 13px var(--font-base); color: var(--color-text-muted); cursor: pointer; text-align: left; }
    .link-btn:hover { color: var(--color-brand); }
    .link-btn .rot { transform: rotate(180deg); }
    .link-btn lucide-icon { transition: transform var(--transition-fast); flex-shrink: 0; }
    .advanced { margin-top: 12px; padding: 16px; background: var(--color-bg-app); border-radius: var(--radius-md); }
    .adv-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 12px; }

    .total { display: flex; gap: 32px; flex-wrap: wrap; }
    .total-item { display: flex; flex-direction: column; }
    .total-n { font: 700 24px var(--font-heading); }
    .total-l { font-size: 12px; color: var(--color-text-muted); }

    .progress.big { height: 12px; margin-top: 18px; }
    .legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--color-text-muted); margin-top: 10px; }
    .legend b { color: var(--color-text-main); }
    .legend .bad b { color: var(--color-error); }
    .legend .spacer { flex: 1; }
    .st-scheduled { background: #EFF6FF; color: #1D4ED8; }
    .st-sending { background: #FFFBEB; color: #B45309; }
    .st-paused { background: #FEF2F2; color: var(--color-error); }
    .st-done { background: #ECFDF5; color: #047857; }
    .st-idle { background: var(--color-bg-app); color: var(--color-text-muted); }
    .seg .alert { margin-top: 14px; }
    .failures { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
    .failure { display: flex; flex-direction: column; font-size: 12px; padding: 8px 12px; background: #FEF2F2; border-radius: 12px; overflow-wrap: anywhere; }
    .failure span { color: #991B1B; }

    @media (max-width: 768px) {
      .when { grid-template-columns: 1fr 1fr; }
      .ends { grid-column: 1 / -1; }
      .adv-grid { grid-template-columns: 1fr 1fr; }
      .reco { flex-wrap: wrap; }
      .hero { flex-direction: column; text-align: center; }
      .legend .spacer { display: none; }
    }
  `],
})
export class RecoveryScheduleStepComponent implements OnInit {
  private api = inject(RecoveryApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Sparkles = Sparkles; readonly CalendarClock = CalendarClock; readonly ChevronDown = ChevronDown;
  readonly ArrowLeft = ArrowLeft; readonly CheckCircle2 = CheckCircle2; readonly Clock = Clock;
  readonly Send = Send; readonly XCircle = XCircle; readonly AlertTriangle = AlertTriangle;
  readonly MessagesSquare = MessagesSquare; readonly Info = Info; readonly Layers = Layers;
  readonly RotateCcw = RotateCcw;

  plan = input.required<RecoveryPlan>();
  planChange = output<RecoveryPlan>();
  back = output<void>();

  rows = signal<Row[]>([]);
  busy = signal(false);
  openAdvanced = signal<string | null>(null);
  openFailures = signal<string | null>(null);
  readonly today = toLocalInputs(new Date().toISOString()).date;

  inProgress = computed(() => ['scheduled', 'sending', 'done'].includes(this.plan().status));
  tracked = computed(() => this.plan().segments.filter(s => s.sendStatus !== 'idle'));
  enabledCount = computed(() => this.rows().filter(r => r.enabled).length);
  totalMessages = computed(() =>
    this.rows().filter(r => r.enabled).reduce((n, r) => n + this.pendingOf(this.segmentOf(r.key)!), 0));
  totalCost = computed(() => (this.totalMessages() * PRICE_PER_MESSAGE_USD).toFixed(2));

  tzNote = computed(() => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const planTz = this.plan().timezone;
    return local && planTz && local !== planTz
      ? `Las horas se muestran en tu zona horaria (${local}); la recomendación se calculó para ${planTz}.`
      : '';
  });

  heroTitle = computed(() => {
    switch (this.plan().status) {
      case 'done': return 'Envío completado';
      case 'sending': return 'Enviando mensajes';
      default: return 'Envío programado';
    }
  });

  heroText = computed(() => {
    const segs = this.tracked();
    const sent = segs.reduce((n, s) => n + sendCounts(s.recipients).sent, 0);
    if (this.plan().status === 'done')
      return `Se enviaron ${sent} mensajes. Las respuestas llegarán a Conversaciones, donde tu agente o tu equipo pueden seguirlas.`;
    if (this.plan().status === 'sending')
      return `${sent} enviados hasta ahora. Puedes cerrar esta pantalla: el envío sigue solo, por tandas.`;
    const first = segs.map(s => s.sendAt).filter(Boolean).sort()[0];
    return first
      ? `El primer mensaje sale ${this.formatDateTime(first)}. No tienes que hacer nada más.`
      : 'Todo listo.';
  });

  ngOnInit() {
    this.rows.set(this.plan().segments
      .filter(s => s.enabled && s.recipients.length && s.sendStatus !== 'done')
      .map(s => {
        const { date, time } = toLocalInputs(s.sendAt ?? s.recommendedAt ?? defaultSendAt());
        return {
          key: s.key, enabled: true, date, time,
          firstBatchSize: s.firstBatchSize, firstPauseMinutes: s.firstPauseMinutes,
          batchSize: s.batchSize, batchIntervalMinutes: s.batchIntervalMinutes,
        };
      }));
  }

  segmentOf(key: string): RecoverySegment | undefined {
    return this.plan().segments.find(s => s.key === key);
  }

  update(key: string, changes: Partial<Row>) {
    this.rows.update(list => list.map(r => (r.key === key ? { ...r, ...changes } : r)));
  }

  toggleAdvanced(key: string) { this.openAdvanced.update(k => (k === key ? null : key)); }
  toggleFailures(key: string) { this.openFailures.update(k => (k === key ? null : key)); }

  isRecommended(row: Row, s: RecoverySegment): boolean {
    if (!s.recommendedAt) return true;
    const reco = toLocalInputs(s.recommendedAt);
    return reco.date === row.date && reco.time === row.time;
  }

  useRecommendation(key: string) {
    const s = this.segmentOf(key);
    if (s?.recommendedAt) this.update(key, toLocalInputs(s.recommendedAt));
  }

  pendingOf(s: RecoverySegment): number {
    return s.recipients.filter(r => !r.sendStatus || r.sendStatus === 'pending').length;
  }

  templateLabel(s: RecoverySegment): string {
    if (s.templateStatus === 'APPROVED') return 'plantilla aprobada';
    if (s.templateStatus === 'PENDING' || s.templateStatus === 'IN_APPEAL') return 'saldrá cuando Meta apruebe la plantilla';
    return `plantilla ${s.templateStatus?.toLowerCase() ?? 'sin crear'}`;
  }

  warningOf(row: Row): string | null {
    if (!row.date || !row.time) return 'Elige día y hora';
    const at = new Date(`${row.date}T${row.time}`);
    if (at.getTime() < Date.now()) return 'Esa hora ya pasó';
    const hour = at.getHours();
    if (hour < 9 || hour >= 21) return 'Fuera de horario: escribir de noche o de madrugada suele generar bloqueos';
    const day = at.getDay();
    if (day === 0 || day === 6) return 'En fin de semana la gente decide menos: mejor de martes a jueves';
    return null;
  }

  endsAt(row: Row, s: RecoverySegment): string {
    if (!row.date || !row.time) return '—';
    const n = this.pendingOf(s);
    let minutes = 0;
    if (n > row.firstBatchSize) {
      const rest = Math.ceil((n - row.firstBatchSize) / Math.max(1, row.batchSize));
      minutes = row.firstPauseMinutes + (rest - 1) * row.batchIntervalMinutes;
    }
    const end = new Date(new Date(`${row.date}T${row.time}`).getTime() + minutes * 60_000);
    return end.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }

  submit() {
    const invalid = this.rows().find(r => r.enabled && (!r.date || !r.time || new Date(`${r.date}T${r.time}`).getTime() < Date.now()));
    if (invalid) {
      this.toast.error(`Revisa la fecha de «${this.segmentOf(invalid.key)?.name}»`);
      return;
    }
    const segments: SegmentSchedule[] = this.rows().map(r => ({
      key: r.key, enabled: r.enabled,
      sendAt: r.enabled ? new Date(`${r.date}T${r.time}`).toISOString() : undefined,
      firstBatchSize: r.firstBatchSize, firstPauseMinutes: r.firstPauseMinutes,
      batchSize: r.batchSize, batchIntervalMinutes: r.batchIntervalMinutes,
    }));
    this.busy.set(true);
    this.api.schedule(this.plan()._id, segments).subscribe({
      next: (plan) => {
        this.busy.set(false);
        this.toast.success('Envío programado');
        this.planChange.emit(plan);
      },
      error: (err: { error?: { message?: string } }) => {
        this.busy.set(false);
        this.toast.error(err.error?.message || 'No se pudo programar el envío');
      },
    });
  }

  async cancel() {
    const ok = await this.confirm.confirm({
      title: 'Detener el envío',
      message: 'Lo que ya se envió queda enviado. Lo pendiente se detiene y podrás editar mensajes, listas y fechas.',
      confirmText: 'Detener',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.cancel(this.plan()._id).subscribe({
      next: (plan) => {
        this.busy.set(false);
        this.toast.success('Envío detenido');
        this.planChange.emit(plan);
        // El input llega en el siguiente ciclo: se reconstruye el formulario después.
        setTimeout(() => this.ngOnInit());
      },
      error: (err: { error?: { message?: string } }) => {
        this.busy.set(false);
        this.toast.error(err.error?.message || 'No se pudo detener el envío');
      },
    });
  }

  counts(s: RecoverySegment) { return sendCounts(s.recipients); }
  pct(n: number, s: RecoverySegment) { return s.recipients.length ? (n / s.recipients.length) * 100 : 0; }
  failedOf(s: RecoverySegment) { return s.recipients.filter(r => r.sendStatus === 'failed'); }

  statusLabel(s: RecoverySegment): string {
    const map: Record<string, string> = {
      scheduled: 'Programado', sending: 'Enviando', paused: 'Detenido', done: 'Completado', idle: 'Sin programar',
    };
    return map[s.sendStatus] ?? s.sendStatus;
  }

  formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }
}

/** Fecha y hora locales del navegador, en el formato de `<input type=date|time>`. */
function toLocalInputs(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Mañana a las 18:30, para segmentos sin recomendación (los creados a mano). */
function defaultSendAt(): string {
  const d = new Date(Date.now() + 86_400_000);
  d.setHours(18, 30, 0, 0);
  return d.toISOString();
}
