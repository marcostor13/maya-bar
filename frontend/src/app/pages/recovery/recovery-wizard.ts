import { Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule, ArrowLeft, Check } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { RecoveryApiService } from '../../core/api/recovery-api.service';
import { RECOVERY_STEPS, RecoveryPlan, stepForStatus } from '../../shared/models/recovery.model';
import { RecoveryAnalyzeStepComponent } from './steps/analyze-step';
import { RecoveryPlanStepComponent } from './steps/plan-step';
import { RecoveryTemplatesStepComponent } from './steps/templates-step';
import { RecoveryScheduleStepComponent } from './steps/schedule-step';

/** Cada cuánto se consulta el plan mientras la IA analiza. */
const ANALYZING_POLL_MS = 3000;
/** Y mientras hay un envío en marcha. */
const SENDING_POLL_MS = 20_000;

@Component({
  selector: 'app-recovery-wizard',
  standalone: true,
  imports: [
    RouterLink, LucideAngularModule, RecoveryAnalyzeStepComponent, RecoveryPlanStepComponent,
    RecoveryTemplatesStepComponent, RecoveryScheduleStepComponent,
  ],
  template: `
    <div class="page animate-fade-in">
      <a class="back" routerLink="/recuperacion">
        <lucide-icon [img]="ArrowLeft" [size]="16"></lucide-icon> Recuperar clientes
      </a>

      <div class="head">
        @if (plan(); as p) {
          <input class="title-input" [value]="p.name" maxlength="80" aria-label="Nombre del plan"
            (blur)="rename($any($event.target).value)" (keydown.enter)="$any($event.target).blur()" />
        } @else {
          <h1 class="page-title">Nueva recuperación</h1>
        }
      </div>

      <nav class="stepper" aria-label="Pasos">
        @for (s of steps; track s.n) {
          <button class="step" type="button"
            [class.active]="step() === s.n" [class.done]="s.n < maxStep()"
            [disabled]="!canVisit(s.n)" (click)="step.set(s.n)"
            [attr.aria-current]="step() === s.n ? 'step' : null">
            <span class="step-n">
              @if (s.n < maxStep() && step() !== s.n) { <lucide-icon [img]="Check" [size]="14" [strokeWidth]="3"></lucide-icon> }
              @else { {{ s.n }} }
            </span>
            <span class="step-text">
              <span class="step-label">{{ s.label }}</span>
              <span class="step-hint">{{ s.hint }}</span>
            </span>
          </button>
          @if (s.n < steps.length) { <span class="step-line" [class.filled]="s.n < maxStep()"></span> }
        }
      </nav>

      @if (loading()) {
        <div class="skeleton"></div>
      } @else {
        <div class="step-body">
          @switch (step()) {
            @case (1) {
              <app-recovery-analyze-step [plan]="plan()" (created)="onCreated($event)" />
            }
            @case (2) {
              @if (plan(); as p) {
                <app-recovery-plan-step [plan]="p" (planChange)="onPlanChange($event)" />
              }
            }
            @case (3) {
              @if (plan(); as p) {
                <app-recovery-templates-step [plan]="p" (planChange)="onPlanChange($event)"
                  (next)="step.set(4)" (back)="step.set(2)" />
              }
            }
            @case (4) {
              @if (plan(); as p) {
                <app-recovery-schedule-step [plan]="p" (planChange)="onPlanChange($event)" (back)="step.set(3)" />
              }
            }
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px 64px; }
    .back { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--color-text-muted); text-decoration: none; }
    .back:hover { color: var(--color-brand); }
    .head { margin: 12px 0 24px; }
    .page-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; margin: 0; }
    .title-input {
      width: 100%; box-sizing: border-box; border: 1px solid transparent; background: transparent; border-radius: 14px;
      font: 700 26px var(--font-heading); color: var(--color-text-main); padding: 4px 12px; margin-left: -12px;
      transition: all var(--transition-fast);
    }
    .title-input:hover { border-color: var(--color-border); }
    .title-input:focus { outline: none; background: var(--color-white); border-color: var(--color-brand); box-shadow: 0 0 0 4px var(--color-brand-light); }

    .stepper {
      display: flex; align-items: center; gap: 8px; background: var(--color-white); border-radius: var(--radius-lg);
      padding: 14px 18px; box-shadow: var(--shadow-sm); margin-bottom: 24px;
    }
    .step {
      display: flex; align-items: center; gap: 12px; border: 0; background: none; padding: 6px 10px 6px 6px;
      border-radius: var(--radius-pill); cursor: pointer; text-align: left; transition: background var(--transition-fast); min-width: 0;
    }
    .step:not(:disabled):hover { background: var(--color-bg-app); }
    .step:disabled { cursor: default; opacity: .55; }
    .step-n {
      width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0;
      font: 700 14px var(--font-heading); background: var(--color-bg-app); color: var(--color-text-muted);
      border: 2px solid var(--color-border); transition: all var(--transition-spring);
    }
    .step.done .step-n { background: var(--color-success); border-color: var(--color-success); color: #fff; }
    .step.active .step-n { background: var(--color-brand); border-color: var(--color-brand); color: #fff; box-shadow: var(--shadow-brand); transform: scale(1.06); }
    .step-text { display: flex; flex-direction: column; min-width: 0; }
    .step-label { font: 600 14px var(--font-heading); color: var(--color-text-main); white-space: nowrap; }
    .step-hint { font-size: 12px; color: var(--color-text-muted); white-space: nowrap; }
    .step-line { flex: 1; height: 2px; min-width: 12px; background: var(--color-border); border-radius: 2px; }
    .step-line.filled { background: var(--color-success); }

    .skeleton { height: 320px; border-radius: var(--radius-lg); background: linear-gradient(90deg, #F3F4F6 25%, #FAFAFA 50%, #F3F4F6 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    @keyframes shimmer { to { background-position: -200% 0; } }

    @media (max-width: 968px) {
      .step-hint { display: none; }
    }
    @media (max-width: 768px) {
      .page { padding: 20px 16px 48px; }
      .title-input, .page-title { font-size: 21px; }
      .stepper { padding: 10px 12px; gap: 4px; }
      .step { padding: 4px; }
      .step-text { display: none; }
      .step.active .step-text { display: flex; }
      .step-n { width: 30px; height: 30px; font-size: 13px; }
    }
  `],
})
export class RecoveryWizardComponent implements OnDestroy {
  private api = inject(RecoveryApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly ArrowLeft = ArrowLeft; readonly Check = Check;
  readonly steps = RECOVERY_STEPS;

  plan = signal<RecoveryPlan | null>(null);
  step = signal(1);
  loading = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Paso más avanzado al que ha llegado el plan. */
  maxStep = computed(() => {
    const p = this.plan();
    return p ? stepForStatus(p.status) : 1;
  });

  constructor() {
    const sub = this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (!id || id === 'nueva') { this.plan.set(null); this.step.set(1); return; }
      if (this.plan()?._id === id) return;
      this.loading.set(true);
      this.api.get(id).subscribe({
        next: (plan) => {
          this.loading.set(false);
          this.plan.set(plan);
          this.step.set(stepForStatus(plan.status));
          this.schedulePoll();
        },
        error: (err: { error?: { message?: string } }) => {
          this.loading.set(false);
          this.toast.error(err.error?.message || 'No se pudo abrir el plan');
          this.router.navigate(['/recuperacion']);
        },
      });
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  ngOnDestroy() { this.clearPoll(); }

  canVisit(n: number): boolean {
    const p = this.plan();
    if (!p) return n === 1;
    if (p.status === 'analyzing' || p.status === 'failed') return n === 1;
    // El paso 1 relanza el análisis: solo tiene sentido antes de crear plantillas.
    if (n === 1) return p.status === 'review';
    return n <= this.maxStep();
  }

  onCreated(plan: RecoveryPlan) {
    this.plan.set(plan);
    this.step.set(1);
    this.router.navigate(['/recuperacion', plan._id], { replaceUrl: true });
    this.schedulePoll();
  }

  /** Avanza solo si el plan avanzó: guardar o cancelar no te cambia de paso. */
  onPlanChange(plan: RecoveryPlan) {
    const before = this.maxStep();
    this.plan.set(plan);
    const after = stepForStatus(plan.status);
    if (after > before) this.step.set(after);
    this.schedulePoll();
  }

  rename(name: string) {
    const p = this.plan();
    const clean = name.trim();
    if (!p || !clean || clean === p.name) return;
    this.api.update(p._id, { name: clean }).subscribe({
      next: (plan) => { this.plan.update(cur => (cur ? { ...cur, name: plan.name } : cur)); this.toast.success('Nombre guardado'); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo renombrar'),
    });
  }

  private schedulePoll() {
    this.clearPoll();
    const p = this.plan();
    if (!p) return;
    const delay = p.status === 'analyzing' ? ANALYZING_POLL_MS
      : p.status === 'scheduled' || p.status === 'sending' ? SENDING_POLL_MS
      : 0;
    if (!delay) return;
    this.timer = setTimeout(() => this.poll(p._id), delay);
  }

  private poll(id: string) {
    this.api.get(id).subscribe({
      next: (plan) => {
        const wasAnalyzing = this.plan()?.status === 'analyzing';
        // Mientras el usuario edita en el paso 2 no se le pisa el formulario.
        if (this.plan()?._id !== id) return;
        this.plan.set(plan);
        if (wasAnalyzing && plan.status === 'review') {
          this.step.set(2);
          this.toast.success('Análisis listo: revisa tu plan');
        } else if (wasAnalyzing && plan.status === 'failed') {
          this.toast.error(plan.analysis?.error || 'El análisis falló');
        }
        this.schedulePoll();
      },
      error: () => this.schedulePoll(),
    });
  }

  private clearPoll() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }
}
