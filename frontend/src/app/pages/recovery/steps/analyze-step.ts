import { Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Sparkles, MessagesSquare, Users, Send, AlertCircle, RotateCcw, Lightbulb,
} from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { RecoveryApiService } from '../../../core/api/recovery-api.service';
import { RecoveryPlan } from '../../../shared/models/recovery.model';
import { RECOVERY_SHARED_STYLES } from '../recovery.styles';

const PERIODS = [7, 15, 30, 60, 90];

/** Frases que rotan mientras la IA trabaja: que la espera se lea como progreso. */
const WORKING_TIPS = [
  'Leyendo las últimas conversaciones…',
  'Detectando quién se quedó a medias…',
  'Buscando las dudas que nadie respondió…',
  'Separando a los que ya son clientes…',
];

@Component({
  selector: 'app-recovery-analyze-step',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    @if (plan()?.status === 'analyzing') {
      <div class="panel working" aria-live="polite">
        <div class="orb"><lucide-icon [img]="Sparkles" [size]="34"></lucide-icon></div>
        <h2 class="working-title">{{ phaseLabel() }}</h2>
        <p class="panel-sub">{{ tip() }}</p>

        @if (total() > 0) {
          <div class="working-progress">
            <div class="progress"><span [style.width.%]="percent()" style="background:var(--color-ai)"></span></div>
            <div class="working-count">{{ processed() }} de {{ total() }} conversaciones</div>
          </div>
        }
        <p class="hint" style="margin-top:20px">
          Puedes salir de esta pantalla: el análisis sigue y lo encontrarás en «Recuperar clientes».
        </p>
      </div>
    } @else {
      <div class="panel intro">
        <div class="intro-head">
          <span class="intro-icon"><lucide-icon [img]="Sparkles" [size]="22"></lucide-icon></span>
          <div>
            <h2 class="panel-title">Recupera a quien se quedó a medias</h2>
            <p class="panel-sub">
              La IA lee tus conversaciones de WhatsApp, detecta quién dejó de responder y por qué,
              y te propone a quién escribir y qué decirle. Tú revisas todo antes de enviar nada.
            </p>
          </div>
        </div>

        <div class="how">
          <div class="how-item">
            <lucide-icon [img]="MessagesSquare" [size]="18"></lucide-icon>
            <span>Analiza cada chat y lo clasifica</span>
          </div>
          <div class="how-item">
            <lucide-icon [img]="Users" [size]="18"></lucide-icon>
            <span>Agrupa a las personas por motivo</span>
          </div>
          <div class="how-item">
            <lucide-icon [img]="Send" [size]="18"></lucide-icon>
            <span>Redacta un mensaje para cada grupo</span>
          </div>
        </div>
      </div>

      @if (plan()?.status === 'failed') {
        <div class="alert alert-danger" style="margin-top:16px" role="alert">
          <lucide-icon [img]="AlertCircle" [size]="18"></lucide-icon>
          <div><strong>No se pudo completar el análisis.</strong><br>{{ plan()?.analysis?.error }}</div>
        </div>
      }

      <div class="panel">
        <div class="field">
          <span class="label">¿Qué conversaciones analizamos?</span>
          <div class="chips" role="radiogroup" aria-label="Periodo">
            @for (d of periods; track d) {
              <button type="button" class="chip" role="radio" [attr.aria-checked]="days() === d"
                [class.active]="days() === d" (click)="days.set(d)">
                Últimos {{ d }} días
              </button>
            }
          </div>
        </div>

        <div class="field" style="margin-top:24px">
          <label class="label" for="rec-context">¿Tienes algo que ofrecer? <span class="optional">Opcional</span></label>
          <textarea id="rec-context" class="textarea" rows="4" maxlength="2000" [(ngModel)]="context"
            placeholder="Ej: Quien contrate antes del 30 de septiembre mantiene el precio de hoy mientras siga activo. Firma los mensajes: Marcos, de Maya Classroom."></textarea>
          <div class="alert alert-ai">
            <lucide-icon [img]="Lightbulb" [size]="16"></lucide-icon>
            <span>La IA solo usará ofertas, precios y enlaces que escribas aquí o que ya conozca tu agente. No inventa descuentos ni urgencias.</span>
          </div>
        </div>

        <div class="footer-bar">
          <span class="spacer"></span>
          <button class="btn btn-primary btn-lg" [disabled]="submitting()" (click)="start()">
            @if (plan()?.status === 'failed') {
              <lucide-icon [img]="RotateCcw" [size]="18"></lucide-icon> Volver a analizar
            } @else {
              <lucide-icon [img]="Sparkles" [size]="18"></lucide-icon> Analizar conversaciones
            }
          </button>
        </div>
      </div>
    }
  `,
  styles: [RECOVERY_SHARED_STYLES, `
    .intro-head { display: flex; gap: 16px; align-items: flex-start; }
    .intro-icon {
      width: 48px; height: 48px; border-radius: 16px; flex-shrink: 0; display: grid; place-items: center;
      background: #F5F3FF; color: var(--color-ai);
    }
    .how { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 20px; }
    .how-item {
      display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: var(--radius-md);
      background: var(--color-bg-app); font-size: 13px; font-weight: 500; color: var(--color-text-main);
    }
    .how-item lucide-icon { color: var(--color-brand); flex-shrink: 0; }
    .optional { font-weight: 500; color: var(--color-text-muted); margin-left: 6px; }

    .working { text-align: center; padding: 56px 24px; display: flex; flex-direction: column; align-items: center; }
    .orb {
      width: 88px; height: 88px; border-radius: 50%; display: grid; place-items: center; color: #fff;
      background: radial-gradient(circle at 30% 30%, #A78BFA, var(--color-ai));
      box-shadow: 0 20px 50px -12px rgba(139, 92, 246, .55); margin-bottom: 24px;
      animation: pulse 2.2s ease-in-out infinite;
    }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
    .working-title { font-family: var(--font-heading); font-size: 22px; font-weight: 600; margin: 0 0 6px; }
    .working-progress { width: 100%; max-width: 420px; margin-top: 28px; }
    .working-count { font-size: 13px; color: var(--color-text-muted); margin-top: 10px; font-weight: 500; }

    @media (max-width: 768px) {
      .how { grid-template-columns: 1fr; }
      .intro-head { flex-direction: column; }
    }
  `],
})
export class RecoveryAnalyzeStepComponent implements OnInit, OnDestroy {
  private api = inject(RecoveryApiService);
  private toast = inject(ToastService);

  readonly Sparkles = Sparkles; readonly MessagesSquare = MessagesSquare; readonly Users = Users;
  readonly Send = Send; readonly AlertCircle = AlertCircle; readonly RotateCcw = RotateCcw;
  readonly Lightbulb = Lightbulb;

  plan = input<RecoveryPlan | null>(null);
  created = output<RecoveryPlan>();

  readonly periods = PERIODS;
  days = signal(30);
  context = '';
  submitting = signal(false);
  private tipIndex = signal(0);
  private tipTimer: ReturnType<typeof setInterval> | null = null;

  total = computed(() => this.plan()?.analysis?.total ?? 0);
  processed = computed(() => this.plan()?.analysis?.processed ?? 0);
  percent = computed(() => (this.total() ? Math.round((this.processed() / this.total()) * 100) : 5));
  tip = computed(() => WORKING_TIPS[this.tipIndex() % WORKING_TIPS.length]);
  phaseLabel = computed(() => {
    if (!this.total()) return 'Buscando conversaciones';
    if (this.processed() >= this.total()) return 'Armando tu plan y redactando los mensajes';
    return 'Analizando tus conversaciones';
  });

  ngOnInit() {
    const p = this.plan();
    if (p) { this.days.set(p.lookbackDays); this.context = p.context ?? ''; }
    this.tipTimer = setInterval(() => this.tipIndex.update(i => i + 1), 3500);
  }

  ngOnDestroy() { if (this.tipTimer) clearInterval(this.tipTimer); }

  start() {
    this.submitting.set(true);
    const existing = this.plan();
    const body = { lookbackDays: this.days(), context: this.context };
    const req = existing
      ? this.api.reanalyze(existing._id, body)
      : this.api.create({ ...body, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    req.subscribe({
      next: (plan) => { this.submitting.set(false); this.created.emit(plan); },
      error: (err: { error?: { message?: string } }) => {
        this.submitting.set(false);
        this.toast.error(err.error?.message || 'No se pudo iniciar el análisis');
      },
    });
  }
}
