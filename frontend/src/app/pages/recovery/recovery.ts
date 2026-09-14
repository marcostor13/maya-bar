import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LucideAngularModule, HeartHandshake, Plus, Sparkles, Users, FileCheck2, CalendarClock,
  Trash2, ArrowRight, MessagesSquare,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { RecoveryApiService } from '../../core/api/recovery-api.service';
import { RecoveryPlan, RecoveryStatus, sendCounts } from '../../shared/models/recovery.model';

const STATUS: Record<RecoveryStatus, { label: string; cls: string; cta: string }> = {
  analyzing: { label: 'Analizando', cls: 'badge-info', cta: 'Ver progreso' },
  review: { label: 'Plan listo para revisar', cls: 'badge-brand', cta: 'Revisar plan' },
  templates: { label: 'Plantillas en revisión', cls: 'badge-warning', cta: 'Continuar' },
  scheduled: { label: 'Programado', cls: 'badge-info', cta: 'Ver envío' },
  sending: { label: 'Enviando', cls: 'badge-warning', cta: 'Ver envío' },
  done: { label: 'Completado', cls: 'badge-success', cta: 'Ver resultado' },
  failed: { label: 'Análisis fallido', cls: 'badge-danger', cta: 'Reintentar' },
};

@Component({
  selector: 'app-recovery',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">Recuperar clientes</h1>
          <p class="page-subtitle">Vuelve a hablar con quien se quedó a medias, con un plan hecho por IA</p>
        </div>
        @if (plans().length) {
          <a class="btn btn-primary btn-lg" routerLink="/recuperacion/nueva">
            <lucide-icon [img]="Plus" [size]="18"></lucide-icon> Nueva recuperación
          </a>
        }
      </div>

      @if (loading()) {
        <div class="skeleton"></div>
      } @else if (!plans().length) {
        <div class="hero">
          <span class="hero-icon"><lucide-icon [img]="HeartHandshake" [size]="34"></lucide-icon></span>
          <h2 class="hero-title">Hay clientes esperando un segundo mensaje</h2>
          <p class="hero-text">
            En cuatro pasos la IA revisa tus conversaciones, te dice quién se enfrió y por qué,
            escribe el mensaje para cada grupo y lo envía cuando más te leen.
          </p>
          <div class="hero-steps">
            @for (s of intro; track s.label; let i = $index) {
              <div class="hero-step">
                <span class="hero-step-icon"><lucide-icon [img]="s.icon" [size]="20"></lucide-icon></span>
                <span class="hero-step-n">Paso {{ i + 1 }}</span>
                <span class="hero-step-label">{{ s.label }}</span>
              </div>
            }
          </div>
          <a class="btn btn-primary btn-lg" routerLink="/recuperacion/nueva">
            <lucide-icon [img]="Sparkles" [size]="18"></lucide-icon> Empezar ahora
          </a>
        </div>
      } @else {
        <div class="grid">
          @for (p of plans(); track p._id) {
            <div class="plan-card" (click)="open(p)" (keydown.enter)="open(p)" tabindex="0" role="link">
              <div class="plan-top">
                <span class="badge" [class]="'badge ' + status(p).cls">{{ status(p).label }}</span>
                <button class="btn btn-icon btn-ghost btn-sm del" title="Eliminar" aria-label="Eliminar plan"
                  (click)="remove(p, $event)">
                  <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                </button>
              </div>
              <h3 class="plan-name">{{ p.name }}</h3>
              @if (p.analysis.headline) { <p class="plan-headline">{{ p.analysis.headline }}</p> }

              @if (p.segments.length) {
                <div class="seg-dots">
                  @for (s of p.segments; track s.key) {
                    <span class="seg-chip" [class.off]="!s.enabled">
                      <span class="dot" [style.background]="s.color"></span>{{ s.name }}
                    </span>
                  }
                </div>
              }

              @let stats = statsOf(p);
              <div class="plan-stats">
                <span><lucide-icon [img]="MessagesSquare" [size]="14"></lucide-icon> {{ p.analysis.total || 0 }} chats</span>
                <span><lucide-icon [img]="Users" [size]="14"></lucide-icon> {{ stats.recipients }} personas</span>
                @if (stats.sent) { <span class="sent">{{ stats.sent }} enviados</span> }
              </div>
              @if (p.status === 'sending' || p.status === 'done') {
                <div class="bar"><span [style.width.%]="stats.recipients ? (stats.sent / stats.recipients) * 100 : 0"></span></div>
              }

              <div class="plan-foot">
                <span class="date">{{ formatDate(p.createdAt) }}</span>
                <span class="cta">{{ status(p).cta }} <lucide-icon [img]="ArrowRight" [size]="14"></lucide-icon></span>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 28px; }
    .page-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; color: var(--color-text-main); margin: 0 0 4px; }
    .page-subtitle { font-size: 14px; color: var(--color-text-muted); margin: 0; }

    .hero {
      background: linear-gradient(160deg, var(--color-white) 40%, var(--color-brand-light));
      border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 56px 32px; text-align: center;
      display: flex; flex-direction: column; align-items: center;
    }
    .hero-icon { width: 76px; height: 76px; border-radius: 24px; background: var(--color-brand); color: #fff; display: grid; place-items: center; box-shadow: var(--shadow-brand); }
    .hero-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; margin: 24px 0 10px; }
    .hero-text { font-size: 15px; color: var(--color-text-muted); max-width: 560px; line-height: 1.6; margin: 0; }
    .hero-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 32px 0; width: 100%; max-width: 760px; }
    .hero-step { background: var(--color-white); border-radius: var(--radius-md); padding: 18px 12px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .hero-step-icon { color: var(--color-brand); }
    .hero-step-n { font-size: 11px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .05em; }
    .hero-step-label { font: 600 14px var(--font-heading); }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .plan-card {
      background: var(--color-white); border-radius: var(--radius-lg); padding: 24px; box-shadow: var(--shadow-sm);
      cursor: pointer; transition: all var(--transition-smooth); display: flex; flex-direction: column; min-width: 0;
    }
    .plan-card:hover, .plan-card:focus-visible { transform: translateY(-4px); box-shadow: var(--shadow-lg); outline: none; }
    .plan-top { display: flex; justify-content: space-between; align-items: center; }
    .del { color: var(--color-text-muted) !important; }
    .del:hover { color: var(--color-error) !important; background: #FEF2F2 !important; }
    .plan-name { font: 600 18px var(--font-heading); margin: 14px 0 4px; overflow-wrap: anywhere; }
    .plan-headline { font-size: 13px; color: var(--color-text-muted); margin: 0; line-height: 1.5; }
    .seg-dots { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
    .seg-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 4px 10px; border-radius: var(--radius-pill); background: var(--color-bg-app); max-width: 100%; }
    .seg-chip.off { opacity: .5; text-decoration: line-through; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .plan-stats { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 16px; font-size: 13px; color: var(--color-text-muted); }
    .plan-stats span { display: inline-flex; align-items: center; gap: 5px; }
    .plan-stats .sent { color: var(--color-success); font-weight: 600; }
    .bar { height: 6px; background: var(--color-bg-app); border-radius: var(--radius-pill); overflow: hidden; margin-top: 10px; }
    .bar span { display: block; height: 100%; background: var(--color-success); }
    .plan-foot { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 18px; }
    .date { font-size: 12px; color: var(--color-text-muted); }
    .cta { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: var(--color-brand); }

    .skeleton { height: 280px; border-radius: var(--radius-lg); background: linear-gradient(90deg, #F3F4F6 25%, #FAFAFA 50%, #F3F4F6 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    @keyframes shimmer { to { background-position: -200% 0; } }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-header { flex-direction: column; }
      .page-header .btn { width: 100%; justify-content: center; }
      .hero { padding: 36px 20px; }
      .hero-title { font-size: 21px; }
      .hero-steps { grid-template-columns: 1fr 1fr; }
      .hero .btn { width: 100%; justify-content: center; }
      .grid { grid-template-columns: 1fr; }
    }
  `],
})
export class RecoveryComponent implements OnInit {
  private api = inject(RecoveryApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);

  readonly HeartHandshake = HeartHandshake; readonly Plus = Plus; readonly Sparkles = Sparkles;
  readonly Users = Users; readonly Trash2 = Trash2; readonly ArrowRight = ArrowRight;
  readonly MessagesSquare = MessagesSquare;

  readonly intro = [
    { label: 'Analizar chats', icon: MessagesSquare },
    { label: 'Revisar el plan', icon: Users },
    { label: 'Aprobar plantillas', icon: FileCheck2 },
    { label: 'Programar envío', icon: CalendarClock },
  ];

  plans = signal<RecoveryPlan[]>([]);
  loading = signal(true);

  ngOnInit() { this.load(); }

  load() {
    this.api.list().subscribe({
      next: (plans) => { this.plans.set(plans); this.loading.set(false); },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.toast.error(err.error?.message || 'No se pudieron cargar los planes');
      },
    });
  }

  status(p: RecoveryPlan) { return STATUS[p.status] ?? STATUS.review; }

  statsOf(p: RecoveryPlan) {
    const recipients = (p.segments ?? []).filter(s => s.enabled).flatMap(s => s.recipients ?? []);
    return { recipients: recipients.length, sent: sendCounts(recipients).sent };
  }

  open(p: RecoveryPlan) { this.router.navigate(['/recuperacion', p._id]); }

  async remove(p: RecoveryPlan, event: Event) {
    event.stopPropagation();
    const ok = await this.confirm.confirm({
      title: 'Eliminar plan',
      message: `¿Eliminar «${p.name}»? Las plantillas creadas en Meta no se borran.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.remove(p._id).subscribe({
      next: () => { this.toast.success('Plan eliminado'); this.plans.update(list => list.filter(x => x._id !== p._id)); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo eliminar'),
    });
  }

  formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
