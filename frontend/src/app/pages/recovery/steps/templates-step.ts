import { Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, CheckCircle2, Clock, XCircle, AlertTriangle, RefreshCw, ArrowRight,
  ArrowLeft, Info, Send, Pencil,
} from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { RecoveryApiService } from '../../../core/api/recovery-api.service';
import {
  RecoveryPlan, RecoverySegment, previewMessage, validateTemplateBody,
} from '../../../shared/models/recovery.model';
import { RECOVERY_SHARED_STYLES } from '../recovery.styles';

/** Cada cuánto se pregunta a Meta mientras quede alguna plantilla en revisión. */
const REFRESH_MS = 30_000;

type TemplateState = 'approved' | 'pending' | 'rejected' | 'error' | 'changed' | 'missing';

@Component({
  selector: 'app-recovery-templates-step',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="panel">
      <h2 class="panel-title">Plantillas en revisión</h2>
      <p class="panel-sub">
        WhatsApp solo deja escribir a quien no te habló en las últimas 24 h con plantillas que Meta haya aprobado.
        La revisión suele tardar de unos minutos a unas horas.
      </p>

      <div class="overall">
        <div class="overall-stat"><span class="n ok">{{ counts().approved }}</span> aprobadas</div>
        <div class="overall-stat"><span class="n wait">{{ counts().pending }}</span> en revisión</div>
        @if (counts().problems) {
          <div class="overall-stat"><span class="n bad">{{ counts().problems }}</span> por corregir</div>
        }
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" [disabled]="refreshing()" (click)="refresh()">
          <lucide-icon [img]="RefreshCw" [size]="14" [class.spin]="refreshing()"></lucide-icon>
          {{ refreshing() ? 'Consultando…' : 'Actualizar estado' }}
        </button>
      </div>

      @if (counts().pending && !counts().problems) {
        <div class="alert alert-info">
          <lucide-icon [img]="Info" [size]="18"></lucide-icon>
          <span>No hace falta que esperes aquí. Puedes programar el envío ya: cada segmento saldrá a su hora en cuanto su plantilla esté aprobada.</span>
        </div>
      }
    </div>

    @for (s of active(); track s.key) {
      @let state = stateOf(s);
      <div class="panel tpl" [style.--seg]="s.color">
        <div class="tpl-head">
          <span class="dot" [style.background]="s.color"></span>
          <div class="tpl-title">
            <span class="tpl-name">{{ s.name }}</span>
            <span class="tpl-meta">{{ s.recipients.length }} personas @if (s.templateName) { · <code>{{ s.templateName }}</code> }</span>
          </div>
          @switch (state) {
            @case ('approved') { <span class="status-pill st-ok"><lucide-icon [img]="CheckCircle2" [size]="14"></lucide-icon> Aprobada</span> }
            @case ('pending') { <span class="status-pill st-wait"><lucide-icon [img]="Clock" [size]="14"></lucide-icon> En revisión</span> }
            @case ('rejected') { <span class="status-pill st-bad"><lucide-icon [img]="XCircle" [size]="14"></lucide-icon> Rechazada</span> }
            @case ('changed') { <span class="status-pill st-warn"><lucide-icon [img]="Pencil" [size]="14"></lucide-icon> Mensaje editado</span> }
            @default { <span class="status-pill st-bad"><lucide-icon [img]="AlertTriangle" [size]="14"></lucide-icon> Sin crear</span> }
          }
        </div>

        @if (state === 'rejected') {
          <div class="alert alert-danger">
            <lucide-icon [img]="XCircle" [size]="16"></lucide-icon>
            <span>Meta la rechazó{{ s.rejectedReason && s.rejectedReason !== 'NONE' ? ': ' + s.rejectedReason : '' }}. Suele pasar por sonar a spam o por la posición de la variable. Ajusta el texto y vuelve a enviarla.</span>
          </div>
        } @else if (state === 'error' || state === 'missing') {
          <div class="alert alert-danger">
            <lucide-icon [img]="AlertTriangle" [size]="16"></lucide-icon>
            <span>{{ s.templateError || 'La plantilla no existe en Meta.' }}</span>
          </div>
        } @else if (state === 'changed') {
          <div class="alert alert-warning">
            <lucide-icon [img]="Pencil" [size]="16"></lucide-icon>
            <span>Cambiaste el mensaje después de crear la plantilla. Hay que volver a enviarla a revisión.</span>
          </div>
        }

        @if (editing() === s.key) {
          <div class="field" style="margin-top:14px">
            @if (state === 'approved' || state === 'pending') {
              <div class="alert alert-warning">
                <lucide-icon [img]="Info" [size]="16"></lucide-icon>
                <span>Al guardar, la plantilla vuelve a revisión de Meta{{ state === 'approved' ? ' y no se podrá enviar hasta que la aprueben de nuevo' : '' }}.</span>
              </div>
            }
            <textarea class="textarea" rows="7" [(ngModel)]="draft" aria-label="Mensaje"></textarea>
            @if (draftError(); as err) { <span class="field-error">{{ err }}</span> }
          </div>
          <div class="tpl-actions">
            <button class="btn btn-ghost btn-sm" (click)="editing.set(null)">Cancelar</button>
            <button class="btn btn-primary btn-sm" [disabled]="!!draftError() || resubmitting()" (click)="resubmit(s)">
              <lucide-icon [img]="Send" [size]="14"></lucide-icon> {{ resubmitting() ? 'Enviando…' : 'Guardar y reenviar a Meta' }}
            </button>
          </div>
        } @else {
          <div class="wa-preview" style="margin-top:14px">
            <div class="wa-bubble">{{ preview(s) }}<span class="wa-time">19:00</span></div>
          </div>
          <div class="tpl-actions">
            <button class="btn btn-secondary btn-sm" [disabled]="resubmitting()" (click)="startEdit(s)">
              <lucide-icon [img]="Pencil" [size]="14"></lucide-icon>
              {{ state === 'approved' || state === 'pending' ? 'Editar mensaje' : 'Corregir mensaje' }}
            </button>
            @if (state === 'changed') {
              <button class="btn btn-primary btn-sm" [disabled]="resubmitting()" (click)="resubmitAll()">
                <lucide-icon [img]="Send" [size]="14"></lucide-icon> Reenviar a Meta
              </button>
            }
          </div>
        }
      </div>
    }

    <div class="footer-bar">
      <button class="btn btn-ghost" (click)="back.emit()">
        <lucide-icon [img]="ArrowLeft" [size]="16"></lucide-icon> Volver al plan
      </button>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-lg" [disabled]="counts().problems > 0" (click)="next.emit()">
        {{ counts().pending ? 'Programar mientras se aprueban' : 'Programar envío' }}
        <lucide-icon [img]="ArrowRight" [size]="18"></lucide-icon>
      </button>
    </div>
  `,
  styles: [RECOVERY_SHARED_STYLES, `
    .overall { display: flex; align-items: center; gap: 20px; margin: 20px 0 16px; flex-wrap: wrap; }
    .overall-stat { font-size: 13px; color: var(--color-text-muted); display: flex; align-items: baseline; gap: 6px; }
    .overall .n { font-family: var(--font-heading); font-size: 24px; font-weight: 700; }
    .n.ok { color: var(--color-success); } .n.wait { color: #B45309; } .n.bad { color: var(--color-error); }
    .overall .spacer { flex: 1; }

    .tpl { position: relative; overflow: hidden; }
    .tpl::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--seg); }
    .tpl-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .tpl-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .tpl-name { font: 600 16px var(--font-heading); }
    .tpl-meta { font-size: 12px; color: var(--color-text-muted); overflow-wrap: anywhere; }
    .tpl-meta code { font-size: 11px; background: var(--color-bg-app); padding: 1px 6px; border-radius: 6px; }
    .tpl-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; flex-wrap: wrap; }
    .st-ok { background: #ECFDF5; color: #047857; }
    .st-wait { background: #FFFBEB; color: #B45309; }
    .st-warn { background: #FFF7ED; color: #C2410C; }
    .st-bad { background: #FEF2F2; color: var(--color-error); }
    .field-error { font-size: 12px; color: var(--color-error); }

    @media (max-width: 768px) {
      .tpl-head { flex-wrap: wrap; }
      .tpl-actions .btn { flex: 1; justify-content: center; }
    }
  `],
})
export class RecoveryTemplatesStepComponent implements OnInit, OnDestroy {
  private api = inject(RecoveryApiService);
  private toast = inject(ToastService);

  readonly CheckCircle2 = CheckCircle2; readonly Clock = Clock; readonly XCircle = XCircle;
  readonly AlertTriangle = AlertTriangle; readonly RefreshCw = RefreshCw; readonly ArrowRight = ArrowRight;
  readonly ArrowLeft = ArrowLeft; readonly Info = Info; readonly Send = Send; readonly Pencil = Pencil;

  plan = input.required<RecoveryPlan>();
  planChange = output<RecoveryPlan>();
  next = output<void>();
  back = output<void>();

  refreshing = signal(false);
  resubmitting = signal(false);
  editing = signal<string | null>(null);
  draft = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  active = computed(() => this.plan().segments.filter(s => s.enabled && s.recipients.length));

  counts = computed(() => {
    const states = this.active().map(s => this.stateOf(s));
    return {
      approved: states.filter(s => s === 'approved').length,
      pending: states.filter(s => s === 'pending').length,
      problems: states.filter(s => !['approved', 'pending'].includes(s)).length,
    };
  });

  ngOnInit() {
    this.timer = setInterval(() => {
      if (this.counts().pending && !this.refreshing() && !this.editing()) this.refresh(true);
    }, REFRESH_MS);
  }

  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  stateOf(s: RecoverySegment): TemplateState {
    if (!s.templateId) return s.templateError ? 'error' : 'missing';
    if (s.templateBody !== s.message) return 'changed';
    if (s.templateError) return 'error';
    switch (s.templateStatus) {
      case 'APPROVED': return 'approved';
      case 'PENDING': case 'IN_APPEAL': return 'pending';
      case 'REJECTED': return 'rejected';
      default: return 'missing';
    }
  }

  preview(s: RecoverySegment) { return previewMessage(s.message); }

  draftError() { return validateTemplateBody(this.draft); }

  startEdit(s: RecoverySegment) { this.draft = s.message; this.editing.set(s.key); }

  refresh(silent = false) {
    this.refreshing.set(true);
    this.api.refreshTemplates(this.plan()._id).subscribe({
      next: (plan) => {
        this.refreshing.set(false);
        const before = this.counts().approved;
        this.planChange.emit(plan);
        const approved = plan.segments.filter(s => s.enabled && s.templateStatus === 'APPROVED').length;
        if (approved > before) this.toast.success('Meta aprobó una plantilla');
        else if (!silent) this.toast.success('Estado actualizado');
      },
      error: (err: { error?: { message?: string } }) => {
        this.refreshing.set(false);
        if (!silent) this.toast.error(err.error?.message || 'No se pudo consultar a Meta');
      },
    });
  }

  /** Guarda el texto corregido de un segmento y reenvía a Meta lo que haya cambiado. */
  resubmit(s: RecoverySegment) {
    this.resubmitting.set(true);
    const segments = this.plan().segments.map(x => ({
      key: x.key, name: x.name, enabled: x.enabled,
      message: x.key === s.key ? this.draft : x.message,
      recipients: x.recipients.map(r => r.conversationId),
    }));
    this.api.update(this.plan()._id, { segments }).subscribe({
      next: () => { this.editing.set(null); this.resubmitAll(); },
      error: (err: { error?: { message?: string } }) => {
        this.resubmitting.set(false);
        this.toast.error(err.error?.message || 'No se pudo guardar el mensaje');
      },
    });
  }

  resubmitAll() {
    this.resubmitting.set(true);
    this.api.submitTemplates(this.plan()._id).subscribe({
      next: (plan) => {
        this.resubmitting.set(false);
        this.planChange.emit(plan);
        const failed = plan.segments.find(x => x.enabled && x.templateError);
        if (failed) this.toast.error(`«${failed.name}»: ${failed.templateError}`);
        else this.toast.success('Enviada de nuevo a revisión');
      },
      error: (err: { error?: { message?: string } }) => {
        this.resubmitting.set(false);
        this.toast.error(err.error?.message || 'No se pudo reenviar a Meta');
      },
    });
  }
}
