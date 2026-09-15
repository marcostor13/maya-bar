import { Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Lightbulb, Users, UserX, MessageCircle, Clock, ChevronDown, Wand2,
  Plus, ArrowRight, AlertCircle, Braces, Trash2, Sparkles, Info, Check,
} from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { ConfirmService } from '../../../shared/confirm';
import { RecoveryApiService } from '../../../core/api/recovery-api.service';
import {
  RecoveryPlan, RecoveryRecipient, SegmentEdit, previewMessage, validateTemplateBody,
} from '../../../shared/models/recovery.model';
import { RECOVERY_SHARED_STYLES } from '../recovery.styles';

interface DraftSegment {
  key: string;
  name: string;
  message: string;
  enabled: boolean;
  color: string;
  description: string;
  strategy: string;
  recipients: RecoveryRecipient[];
  templateId?: string;
}

const EXCLUDED = '__excluded__';
/** Cada cuánto se pregunta por una reescritura en curso, y cuánto se espera. */
const REWRITE_POLL_MS = 2500;
const REWRITE_TIMEOUT_MS = 6 * 60_000;
const LIST_PREVIEW = 30;
const DEFAULT_CUSTOM_MESSAGE =
  'Hola {{1}}, te escribo porque me quedé con tu consulta a medias.\n\n¿Te puedo ayudar con algo?';

@Component({
  selector: 'app-recovery-plan-step',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, LucideAngularModule],
  template: `
    @let a = plan().analysis;

    <!-- Resumen -->
    <div class="panel summary">
      <div class="summary-top">
        <span class="ai-tag"><lucide-icon [img]="Sparkles" [size]="13"></lucide-icon> Resumen de la IA</span>
        <h2 class="headline">{{ a.headline || (toRecover() + ' personas se pueden recuperar') }}</h2>
        @if (a.summary) { <p class="panel-sub">{{ a.summary }}</p> }
      </div>

      <div class="kpis">
        <div class="kpi"><lucide-icon [img]="MessageCircle" [size]="18"></lucide-icon>
          <div><div class="kpi-value">{{ a.total }}</div><div class="kpi-label">Conversaciones analizadas</div></div></div>
        <div class="kpi kpi-brand"><lucide-icon [img]="Users" [size]="18"></lucide-icon>
          <div><div class="kpi-value">{{ toRecover() }}</div><div class="kpi-label">Personas a recuperar</div></div></div>
        <div class="kpi"><lucide-icon [img]="UserX" [size]="18"></lucide-icon>
          <div><div class="kpi-value">{{ excluded().length }}</div><div class="kpi-label">Excluidas</div></div></div>
        <div class="kpi"><lucide-icon [img]="Clock" [size]="18"></lucide-icon>
          <div><div class="kpi-value">{{ bestHourLabel() }}</div><div class="kpi-label">Hora con más actividad</div></div></div>
      </div>

      <div class="summary-grid">
        @if (a.insights.length) {
          <div class="insights">
            <span class="label">Lo que encontramos</span>
            @for (insight of a.insights; track $index) {
              <div class="insight"><lucide-icon [img]="Lightbulb" [size]="16"></lucide-icon><span>{{ insight }}</span></div>
            }
          </div>
        }
        @if (hours().length) {
          <div class="hours">
            <span class="label">Cuándo te escriben</span>
            <div class="bars" role="img" [attr.aria-label]="'Mensajes por hora. Pico a las ' + bestHourLabel()">
              @for (h of hours(); track h.hour) {
                <div class="bar-col" [title]="h.hour + ':00 · ' + h.count + ' mensajes'">
                  <span class="bar" [class.best]="h.hour === a.bestHour" [style.height.%]="h.pct"></span>
                  <span class="bar-tick">{{ h.hour % 3 === 0 ? h.hour : '' }}</span>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>

    @if (locked()) {
      <div class="alert alert-warning" style="margin-top:16px">
        <lucide-icon [img]="Info" [size]="18"></lucide-icon>
        <span>El envío ya está programado. Cancélalo en el paso 4 si necesitas cambiar listas o mensajes.</span>
      </div>
    }

    <!-- Segmentos -->
    <div class="section-head">
      <div>
        <h3 class="panel-title">Segmentos y mensajes</h3>
        <p class="panel-sub">Revisa a quién se escribe y qué se le dice. Puedes mover personas, editar el texto o pedir otra versión.</p>
      </div>
      @if (!locked()) {
        <button class="btn btn-secondary btn-sm" (click)="addSegment()">
          <lucide-icon [img]="Plus" [size]="14"></lucide-icon> Nuevo segmento
        </button>
      }
    </div>

    @for (s of segments(); track s.key) {
      <div class="panel segment" [class.disabled]="!s.enabled" [style.--seg]="s.color">
        <div class="seg-head">
          <span class="dot" [style.background]="s.color"></span>
          <input class="seg-name" [ngModel]="s.name" (ngModelChange)="patch(s.key, { name: $event })"
            [disabled]="locked()" maxlength="60" aria-label="Nombre del segmento" />
          <span class="badge badge-neutral">{{ s.recipients.length }} {{ s.recipients.length === 1 ? 'persona' : 'personas' }}</span>
          <label class="switch" [title]="s.enabled ? 'Se enviará' : 'No se enviará'">
            <input type="checkbox" [checked]="s.enabled" [disabled]="locked()"
              (change)="patch(s.key, { enabled: $any($event.target).checked })"
              [attr.aria-label]="'Enviar a ' + s.name" />
            <span class="track"></span>
          </label>
        </div>
        <p class="seg-desc">{{ s.description }}</p>

        @if (s.enabled) {
          <div class="seg-body">
            <div class="editor">
              @if (s.strategy) {
                <div class="strategy"><lucide-icon [img]="Sparkles" [size]="14"></lucide-icon><span>{{ s.strategy }}</span></div>
              }
              <div class="field">
                <div class="editor-head">
                  <label class="label" [for]="'msg-' + s.key">Mensaje</label>
                  <span class="counter" [class.over]="s.message.length > 1024">{{ s.message.length }}/1024</span>
                </div>
                <textarea #ta class="textarea msg" [id]="'msg-' + s.key" rows="8" [ngModel]="s.message"
                  (ngModelChange)="patch(s.key, { message: $event })" [disabled]="locked()"></textarea>
                @if (errorOf(s); as err) {
                  <span class="field-error"><lucide-icon [img]="AlertCircle" [size]="13"></lucide-icon> {{ err }}</span>
                }
                @if (!locked()) {
                  <div class="editor-tools">
                    <button type="button" class="btn btn-ghost btn-sm" (click)="insertName(s.key, ta)">
                      <lucide-icon [img]="Braces" [size]="14"></lucide-icon> Insertar nombre
                    </button>
                  </div>
                  <div class="rewrite">
                    <input class="input" [ngModel]="instructions()[s.key] ?? ''" (ngModelChange)="setInstruction(s.key, $event)"
                      placeholder="Ej: más corto, menciona la demo…" maxlength="500" (keydown.enter)="rewrite(s.key)"
                      [attr.aria-label]="'Indicación para reescribir ' + s.name" />
                    <button class="btn btn-secondary btn-sm" [disabled]="rewriting() === s.key" (click)="rewrite(s.key)">
                      <lucide-icon [img]="Wand2" [size]="14" [class.spin]="rewriting() === s.key"></lucide-icon>
                      {{ rewriting() === s.key ? 'Escribiendo…' : 'Otra versión' }}
                    </button>
                  </div>
                }
              </div>
            </div>

            <div class="wa-preview" aria-label="Vista previa">
              <span class="wa-label">Así lo verá {{ sampleName(s) }}</span>
              <div class="wa-bubble">{{ preview(s) }}<span class="wa-time">19:00</span></div>
            </div>
          </div>
        }

        <button class="people-toggle" (click)="toggle(s.key)" [attr.aria-expanded]="isOpen(s.key)">
          <lucide-icon [img]="ChevronDown" [size]="16" [class.rot]="isOpen(s.key)"></lucide-icon>
          {{ isOpen(s.key) ? 'Ocultar personas' : 'Ver personas' }}
        </button>

        @if (isOpen(s.key)) {
          <div class="people">
            @if (!s.recipients.length) {
              <p class="hint" style="padding:12px 0">Vacío. Mueve personas aquí desde otros segmentos o desde los excluidos.</p>
              @if (!locked() && !s.templateId) {
                <button class="btn btn-ghost btn-sm action-delete" (click)="removeSegment(s.key)">
                  <lucide-icon [img]="Trash2" [size]="14"></lucide-icon> Eliminar segmento
                </button>
              }
            }
            @for (r of visible(s.key, s.recipients); track r.conversationId) {
              <ng-container *ngTemplateOutlet="row; context: { $implicit: r, from: s.key }" />
            }
            @if (s.recipients.length > LIST_PREVIEW && !showAll()[s.key]) {
              <button class="btn btn-ghost btn-sm" (click)="expandAll(s.key)">Ver las {{ s.recipients.length }}</button>
            }
          </div>
        }
      </div>
    }

    <!-- Excluidos -->
    @if (excluded().length) {
      <div class="panel segment excluded-panel">
        <button class="people-toggle head" (click)="toggle(EXCLUDED)" [attr.aria-expanded]="isOpen(EXCLUDED)">
          <lucide-icon [img]="UserX" [size]="18"></lucide-icon>
          <span class="excl-title">No se les escribirá</span>
          <span class="badge badge-neutral">{{ excluded().length }}</span>
          <span class="spacer"></span>
          <lucide-icon [img]="ChevronDown" [size]="16" [class.rot]="isOpen(EXCLUDED)"></lucide-icon>
        </button>
        <p class="seg-desc">Clientes actuales, chats activos, quien pidió no ser contactado o no encaja. Revísalo por si hay alguien que sí quieras incluir.</p>
        @if (isOpen(EXCLUDED)) {
          <div class="people">
            @for (r of visible(EXCLUDED, excluded()); track r.conversationId) {
              <ng-container *ngTemplateOutlet="row; context: { $implicit: r, from: EXCLUDED }" />
            }
            @if (excluded().length > LIST_PREVIEW && !showAll()[EXCLUDED]) {
              <button class="btn btn-ghost btn-sm" (click)="expandAll(EXCLUDED)">Ver los {{ excluded().length }}</button>
            }
          </div>
        }
      </div>
    }

    <ng-template #row let-r let-from="from">
      <div class="person">
        <div class="avatar" [style.background]="colorOf(from) + '22'" [style.color]="colorOf(from)">{{ initial(r) }}</div>
        <div class="person-main">
          <div class="person-top">
            <span class="person-name">{{ r.name || r.phone }}</span>
            @if (r.name) { <span class="person-phone">+{{ r.phone }}</span> }
            @if (r.insideWindow) { <span class="badge badge-info mini" title="Escribió en las últimas 24 h">24 h</span> }
          </div>
          @if (r.note) { <div class="person-note">{{ r.note }}</div> }
          <div class="person-meta">
            Último mensaje {{ ago(r.lastMessageAt) }}
            @if (r.reason) { · <span class="reason">{{ r.reason }}</span> }
          </div>
        </div>
        @if (!locked()) {
          <select class="select move" [ngModel]="from" (ngModelChange)="move(r.conversationId, from, $event)"
            [attr.aria-label]="'Mover a ' + (r.name || r.phone)">
            @for (opt of segments(); track opt.key) {
              <option [value]="opt.key">{{ opt.key === from ? 'En: ' : 'Mover a: ' }}{{ opt.name }}</option>
            }
            <option [value]="EXCLUDED">{{ from === EXCLUDED ? 'Excluido' : 'No escribirle' }}</option>
          </select>
        }
      </div>
    </ng-template>

    <div class="footer-bar">
      <span class="save-state">
        @if (saving()) { Guardando… }
        @else if (savedOnce()) { <lucide-icon [img]="Check" [size]="14"></lucide-icon> Cambios guardados }
      </span>
      <span class="spacer"></span>
      @if (!locked()) {
        <button class="btn btn-primary btn-lg" [disabled]="submitting() || !activeSegments().length" (click)="approve()">
          {{ submitting() ? 'Creando plantillas…' : 'Aprobar plan y crear plantillas' }}
          <lucide-icon [img]="ArrowRight" [size]="18"></lucide-icon>
        </button>
      }
    </div>
  `,
  styles: [RECOVERY_SHARED_STYLES, `
    .ai-tag {
      display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600;
      color: var(--color-ai); background: #F5F3FF; padding: 5px 12px; border-radius: var(--radius-pill);
    }
    .headline { font-family: var(--font-heading); font-size: 24px; font-weight: 700; line-height: 1.25; margin: 14px 0 8px; }

    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 24px; }
    .kpi {
      display: flex; gap: 12px; align-items: center; padding: 16px; border-radius: var(--radius-md);
      background: var(--color-bg-app); min-width: 0;
    }
    .kpi lucide-icon { color: var(--color-text-muted); flex-shrink: 0; }
    .kpi-brand { background: var(--color-brand-light); }
    .kpi-brand lucide-icon, .kpi-brand .kpi-value { color: var(--color-brand); }
    .kpi-value { font-family: var(--font-heading); font-size: 22px; font-weight: 700; line-height: 1.1; }
    .kpi-label { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; }

    .summary-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 24px; margin-top: 24px; }
    .insights { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .insight { display: flex; gap: 10px; font-size: 14px; line-height: 1.5; color: var(--color-text-main); }
    .insight lucide-icon { color: var(--color-warning); flex-shrink: 0; margin-top: 2px; }
    .hours { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .bars { display: flex; align-items: flex-end; gap: 3px; height: 110px; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; min-width: 0; }
    .bar { width: 100%; min-height: 3px; border-radius: 4px 4px 0 0; background: #E9D5FF; transition: height var(--transition-smooth); }
    .bar.best { background: var(--color-ai); }
    .bar-tick { font-size: 10px; color: var(--color-text-muted); height: 14px; margin-top: 4px; }

    .section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin: 32px 0 16px; }

    .segment { position: relative; overflow: hidden; }
    .segment::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--seg, var(--color-border)); }
    .segment.disabled { opacity: .7; }
    .seg-head { display: flex; align-items: center; gap: 12px; }
    .seg-name {
      flex: 1; min-width: 0; border: 1px solid transparent; background: transparent; border-radius: 12px;
      font: 600 17px var(--font-heading); color: var(--color-text-main); padding: 6px 10px; margin-left: -10px;
      transition: all var(--transition-fast);
    }
    .seg-name:hover:not(:disabled) { border-color: var(--color-border); }
    .seg-name:focus { outline: none; border-color: var(--color-brand); background: var(--color-white); box-shadow: 0 0 0 4px var(--color-brand-light); }
    .seg-desc { font-size: 13px; color: var(--color-text-muted); margin: 6px 0 0 22px; line-height: 1.5; }

    .seg-body { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; margin-top: 20px; }
    .editor { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .strategy { display: flex; gap: 8px; font-size: 13px; color: #5B21B6; background: #F5F3FF; padding: 10px 14px; border-radius: 14px; line-height: 1.45; }
    .strategy lucide-icon { flex-shrink: 0; margin-top: 2px; }
    .editor-head { display: flex; justify-content: space-between; align-items: center; }
    .counter { font-size: 12px; color: var(--color-text-muted); }
    .counter.over { color: var(--color-error); font-weight: 600; }
    .msg { min-height: 180px; line-height: 1.5; }
    .field-error { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-error); }
    .editor-tools { display: flex; gap: 8px; }
    .rewrite { display: flex; gap: 8px; }
    .rewrite .input { flex: 1; min-width: 0; padding: 9px 16px; font-size: 13px; }
    .rewrite .btn { flex-shrink: 0; }

    .people-toggle {
      display: inline-flex; align-items: center; gap: 8px; margin-top: 16px; padding: 8px 0; border: 0; background: none;
      font: 600 13px var(--font-base); color: var(--color-brand); cursor: pointer;
    }
    .people-toggle lucide-icon { transition: transform var(--transition-fast); }
    .people-toggle .rot { transform: rotate(180deg); }
    .people-toggle.head { margin: 0; width: 100%; color: var(--color-text-main); }
    .excl-title { font-family: var(--font-heading); font-size: 16px; }
    .people-toggle .spacer { flex: 1; }
    .excluded-panel { background: var(--color-bg-light); box-shadow: none; border: 1px dashed var(--color-border); }
    .excluded-panel .seg-desc { margin-left: 26px; }

    .people { margin-top: 8px; border-top: 1px solid var(--color-border); }
    .person { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--color-border); }
    .person:last-of-type { border-bottom: 0; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
    .person-main { flex: 1; min-width: 0; }
    .person-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .person-name { font-weight: 600; font-size: 14px; overflow-wrap: anywhere; }
    .person-phone { font-size: 12px; color: var(--color-text-muted); }
    .person-note { font-size: 13px; color: var(--color-text-main); margin-top: 3px; line-height: 1.45; overflow-wrap: anywhere; }
    .person-meta { font-size: 12px; color: var(--color-text-muted); margin-top: 3px; }
    .reason { color: #B45309; }
    .mini { padding: 2px 8px; font-size: 11px; }
    .move { width: 210px; max-width: 45%; min-width: 0; padding: 8px 36px 8px 14px; font-size: 12px; flex-shrink: 0; }
    .action-delete { color: var(--color-text-muted) !important; margin-bottom: 8px; }
    .action-delete:hover { color: var(--color-error) !important; }

    .save-state { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-text-muted); }

    @media (max-width: 968px) {
      .kpis { grid-template-columns: repeat(2, 1fr); }
      .summary-grid, .seg-body { grid-template-columns: 1fr; }
    }
    @media (max-width: 768px) {
      .headline { font-size: 20px; }
      .section-head { flex-direction: column; align-items: stretch; }
      .person { flex-wrap: wrap; }
      .move { width: 100%; max-width: 100%; margin-left: 48px; }
      .rewrite { flex-direction: column; }
    }
  `],
})
export class RecoveryPlanStepComponent implements OnInit, OnDestroy {
  private api = inject(RecoveryApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Lightbulb = Lightbulb; readonly Users = Users; readonly UserX = UserX;
  readonly MessageCircle = MessageCircle; readonly Clock = Clock; readonly ChevronDown = ChevronDown;
  readonly Wand2 = Wand2; readonly Plus = Plus; readonly ArrowRight = ArrowRight;
  readonly AlertCircle = AlertCircle; readonly Braces = Braces; readonly Trash2 = Trash2;
  readonly Sparkles = Sparkles; readonly Info = Info; readonly Check = Check;
  readonly EXCLUDED = EXCLUDED;
  readonly LIST_PREVIEW = LIST_PREVIEW;

  plan = input.required<RecoveryPlan>();
  planChange = output<RecoveryPlan>();

  segments = signal<DraftSegment[]>([]);
  excluded = signal<RecoveryRecipient[]>([]);
  open = signal<Record<string, boolean>>({});
  showAll = signal<Record<string, boolean>>({});
  instructions = signal<Record<string, string | undefined>>({});
  rewriting = signal<string | null>(null);
  saving = signal(false);
  savedOnce = signal(false);
  submitting = signal(false);

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private rewriteTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSave = false;

  locked = computed(() => ['scheduled', 'sending', 'done'].includes(this.plan().status));
  activeSegments = computed(() => this.segments().filter(s => s.enabled && s.recipients.length));
  toRecover = computed(() => this.activeSegments().reduce((n, s) => n + s.recipients.length, 0));

  hours = computed(() => {
    const hist = this.plan().analysis.hourHistogram ?? [];
    if (!hist.some(Boolean)) return [];
    const slice = hist.map((count, hour) => ({ hour, count })).filter(h => h.hour >= 7);
    const max = Math.max(...slice.map(h => h.count), 1);
    return slice.map(h => ({ ...h, pct: Math.max(3, (h.count / max) * 100) }));
  });

  bestHourLabel = computed(() => {
    const h = this.plan().analysis.bestHour;
    return h === undefined || h === null ? '—' : `${String(h).padStart(2, '0')}:00`;
  });

  ngOnInit() {
    const p = this.plan();
    this.segments.set(p.segments.map(s => ({
      key: s.key, name: s.name, message: s.message, enabled: s.enabled, color: s.color,
      description: s.description, strategy: s.strategy, recipients: [...s.recipients], templateId: s.templateId,
    })));
    this.excluded.set([...p.excluded]);
    // Si se salió con una reescritura en marcha, se sigue esperándola.
    const pending = p.segments.find(s => s.rewriteJob?.state === 'pending' || s.rewriteJob?.state === 'running');
    if (pending?.rewriteJob) {
      this.rewriting.set(pending.key);
      this.waitRewrite(pending.key, pending.rewriteJob.requestedAt, Date.now());
    }
  }

  ngOnDestroy() {
    if (this.rewriteTimer) { clearTimeout(this.rewriteTimer); this.rewriteTimer = null; }
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (this.pendingSave) this.save().catch(() => undefined);
  }

  // ── Edición ─────────────────────────────────────────────────────────

  patch(key: string, changes: Partial<DraftSegment>) {
    this.segments.update(list => list.map(s => (s.key === key ? { ...s, ...changes } : s)));
    this.scheduleSave();
  }

  setInstruction(key: string, value: string) {
    this.instructions.update(m => ({ ...m, [key]: value }));
  }

  toggle(key: string) { this.open.update(m => ({ ...m, [key]: !m[key] })); }
  isOpen(key: string) { return !!this.open()[key]; }
  expandAll(key: string) { this.showAll.update(m => ({ ...m, [key]: true })); }
  visible(key: string, list: RecoveryRecipient[]) {
    return this.showAll()[key] ? list : list.slice(0, LIST_PREVIEW);
  }

  insertName(key: string, ta: HTMLTextAreaElement) {
    const s = this.segments().find(x => x.key === key);
    if (!s) return;
    const start = ta.selectionStart ?? s.message.length;
    const end = ta.selectionEnd ?? start;
    const message = s.message.slice(0, start) + '{{1}}' + s.message.slice(end);
    this.patch(key, { message });
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + 5, start + 5); });
  }

  move(conversationId: string, from: string, to: string) {
    if (from === to) return;
    let person: RecoveryRecipient | undefined;
    if (from === EXCLUDED) {
      person = this.excluded().find(r => r.conversationId === conversationId);
      this.excluded.update(list => list.filter(r => r.conversationId !== conversationId));
    } else {
      person = this.segments().find(s => s.key === from)?.recipients.find(r => r.conversationId === conversationId);
      this.segments.update(list => list.map(s =>
        s.key === from ? { ...s, recipients: s.recipients.filter(r => r.conversationId !== conversationId) } : s));
    }
    if (!person) return;
    if (to === EXCLUDED) {
      this.excluded.update(list => [{ ...person!, reason: 'Quitado manualmente' }, ...list]);
    } else {
      this.segments.update(list => list.map(s =>
        s.key === to ? { ...s, recipients: [{ ...person!, reason: undefined }, ...s.recipients] } : s));
    }
    const target = to === EXCLUDED ? 'No se le escribirá' : `Movido a «${this.segments().find(s => s.key === to)?.name}»`;
    this.toast.success(`${person.name || person.phone}: ${target}`);
    this.scheduleSave();
  }

  addSegment() {
    const key = `custom_${Date.now().toString(36)}`;
    this.segments.update(list => [...list, {
      key, name: 'Nuevo segmento', message: DEFAULT_CUSTOM_MESSAGE, enabled: true,
      color: '#0EA5E9', description: 'Segmento creado a mano. Mueve personas aquí desde los demás.',
      strategy: '', recipients: [],
    }]);
    this.open.update(m => ({ ...m, [key]: true }));
    this.scheduleSave();
  }

  removeSegment(key: string) {
    this.segments.update(list => list.filter(s => s.key !== key));
    this.scheduleSave();
  }

  /**
   * Pide otra versión. La IA trabaja en segundo plano (puede tardar un par de
   * minutos): aquí solo se encola y se consulta hasta que termina.
   */
  async rewrite(key: string) {
    if (this.rewriting()) return;
    this.rewriting.set(key);
    try {
      await this.flushSave();
    } catch {
      this.rewriting.set(null);
      return;
    }
    this.api.rewrite(this.plan()._id, key, this.instructions()[key] ?? '').subscribe({
      next: ({ requestedAt }) => this.waitRewrite(key, requestedAt, Date.now()),
      error: (err: { error?: { message?: string } }) => {
        this.rewriting.set(null);
        this.toast.error(err.error?.message || 'No se pudo pedir otra versión');
      },
    });
  }

  private waitRewrite(key: string, requestedAt: string, startedAt: number) {
    this.rewriteTimer = setTimeout(() => {
      this.rewriteTimer = null;
      this.api.get(this.plan()._id).subscribe({
        next: (plan) => {
          const job = plan.segments.find(s => s.key === key)?.rewriteJob;
          const mine = !!job && new Date(job.requestedAt).getTime() === new Date(requestedAt).getTime();
          if (!mine) { this.rewriting.set(null); return; }
          if (job.state === 'done' && job.result) {
            this.rewriting.set(null);
            this.patch(key, { message: job.result });
            this.toast.success('Nueva versión lista. Si no te convence, pide otra.');
          } else if (job.state === 'failed') {
            this.rewriting.set(null);
            this.toast.error(job.error || 'La IA no pudo reescribir el mensaje');
          } else if (Date.now() - startedAt > REWRITE_TIMEOUT_MS) {
            this.rewriting.set(null);
            this.toast.error('La IA está tardando demasiado. Vuelve a intentarlo en un momento.');
          } else {
            this.waitRewrite(key, requestedAt, startedAt);
          }
        },
        // Un fallo de red puntual no cancela la espera.
        error: () => this.waitRewrite(key, requestedAt, startedAt),
      });
    }, REWRITE_POLL_MS);
  }

  // ── Guardado ────────────────────────────────────────────────────────

  private scheduleSave() {
    if (this.locked()) return;
    this.pendingSave = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save().catch(() => undefined); }, 1200);
  }

  private async flushSave() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (this.pendingSave) await this.save();
  }

  private save(): Promise<RecoveryPlan> {
    this.pendingSave = false;
    this.saving.set(true);
    const segments: SegmentEdit[] = this.segments().map(s => ({
      key: s.key, name: s.name.trim() || 'Segmento', message: s.message, enabled: s.enabled,
      recipients: s.recipients.map(r => r.conversationId),
    }));
    return new Promise((resolve, reject) => {
      this.api.update(this.plan()._id, { segments }).subscribe({
        next: (plan) => {
          this.saving.set(false); this.savedOnce.set(true);
          this.planChange.emit(plan);
          resolve(plan);
        },
        error: (err: { error?: { message?: string } }) => {
          this.saving.set(false);
          this.toast.error(err.error?.message || 'No se pudieron guardar los cambios');
          reject(err);
        },
      });
    });
  }

  async approve() {
    const active = this.activeSegments();
    const invalid = active.map(s => ({ s, err: this.errorOf(s) })).find(x => x.err);
    if (invalid) {
      this.open.update(m => ({ ...m, [invalid.s.key]: true }));
      this.toast.error(`«${invalid.s.name}»: ${invalid.err}`);
      return;
    }
    const ok = await this.confirm.confirm({
      title: 'Crear plantillas en WhatsApp',
      message: `Se enviarán ${active.length} ${active.length === 1 ? 'plantilla' : 'plantillas'} a Meta para su revisión, una por segmento (${this.toRecover()} personas en total). Todavía no se manda nada a tus clientes.`,
      confirmText: 'Crear plantillas',
    });
    if (!ok) return;

    this.submitting.set(true);
    try {
      await this.flushSave();
    } catch {
      this.submitting.set(false);
      return;
    }
    this.api.submitTemplates(this.plan()._id).subscribe({
      next: (plan) => {
        this.submitting.set(false);
        const failed = plan.segments.filter(s => s.templateError).length;
        if (failed) this.toast.error(`${failed} plantilla(s) no se pudieron crear. Revísalas en el siguiente paso.`);
        else this.toast.success('Plantillas enviadas a Meta para revisión');
        this.planChange.emit(plan);
      },
      error: (err: { error?: { message?: string } }) => {
        this.submitting.set(false);
        this.toast.error(err.error?.message || 'No se pudieron crear las plantillas');
      },
    });
  }

  // ── Presentación ────────────────────────────────────────────────────

  errorOf(s: DraftSegment): string | null {
    return s.enabled && s.recipients.length ? validateTemplateBody(s.message) : null;
  }

  sampleName(s: DraftSegment): string {
    const first = s.recipients.find(r => /^[\p{L}]{2,}/u.test(r.name ?? ''))?.name.split(/\s+/)[0];
    return first ?? 'María';
  }

  preview(s: DraftSegment): string { return previewMessage(s.message, this.sampleName(s)); }

  colorOf(key: string): string {
    return this.segments().find(s => s.key === key)?.color ?? '#6B7280';
  }

  initial(r: RecoveryRecipient): string {
    return (r.name?.trim()?.[0] ?? '#').toUpperCase();
  }

  ago(iso: string): string {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return 'hoy';
    if (days === 1) return 'ayer';
    return `hace ${days} días`;
  }
}
