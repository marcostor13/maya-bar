import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import {
  LucideAngularModule, ArrowLeft, Sparkles, Check, X, History, RotateCcw, MessageSquare, Eye, EyeOff,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export interface Suggestion {
  title: string;
  problem: string;
  evidence: { conversationId: string; excerpt: string }[];
  action: 'add' | 'replace' | 'remove';
  find?: string;
  text?: string;
  status: 'pending' | 'applied' | 'discarded';
}

export interface Review {
  _id: string;
  days: number;
  conversationsAnalyzed: number;
  summary: string;
  suggestions: Suggestion[];
  createdAt: string;
}

export interface PromptVersion {
  _id: string;
  prompt: string;
  source: 'manual' | 'suggestion' | 'restore';
  note?: string;
  createdAt: string;
}

interface AgentLite { _id: string; name: string; systemPrompt: string }

const SOURCE_LABEL: Record<PromptVersion['source'], string> = {
  manual: 'Edición manual',
  suggestion: 'Sugerencia aplicada',
  restore: 'Restauración',
};

const errorText = (err: HttpErrorResponse, fallback: string) => {
  const m = (err.error as { message?: string | string[] } | null)?.message;
  return (Array.isArray(m) ? m[0] : m) || fallback;
};

@Component({
  selector: 'app-agent-improve',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <a routerLink="/ai-agents" class="back-link">
        <lucide-icon [img]="ArrowLeft" [size]="16"></lucide-icon> Agentes IA
      </a>
      <div class="page-header">
        <div>
          <h1>Mejorar {{ agent()?.name || 'agente' }}</h1>
          <p class="page-sub">La IA lee las conversaciones reales del agente y propone cambios a su prompt. Tú decides cuáles aplicar.</p>
        </div>
      </div>

      <section class="card analyze-card">
        <div class="analyze-row">
          <label class="field">
            <span>Periodo a analizar</span>
            <select class="select" name="days" [(ngModel)]="days" [disabled]="analyzing()">
              @for (d of dayOptions; track d) { <option [ngValue]="d">Últimos {{ d }} días</option> }
            </select>
          </label>
          <button class="btn btn-primary" (click)="analyze()" [disabled]="analyzing() || !agent()">
            <lucide-icon [img]="Sparkles" [size]="16"></lucide-icon>
            {{ analyzing() ? 'Analizando…' : 'Analizar conversaciones' }}
          </button>
        </div>
        @if (analyzing()) {
          <p class="hint" role="status">Leyendo hasta 30 conversaciones. Puede tardar hasta 2 minutos.</p>
        }
      </section>

      @if (reviews().length > 1) {
        <label class="field review-picker">
          <span>Análisis</span>
          <select class="select" name="review" [ngModel]="current()?._id" (ngModelChange)="selectReview($event)">
            @for (r of reviews(); track r._id) {
              <option [value]="r._id">{{ r.createdAt | date: 'dd/MM/yyyy HH:mm' }} · {{ r.conversationsAnalyzed }} conversaciones</option>
            }
          </select>
        </label>
      }

      @if (current(); as r) {
        <section class="card review">
          <h2>Diagnóstico</h2>
          <p class="meta">{{ r.createdAt | date: 'dd/MM/yyyy HH:mm' }} · {{ r.conversationsAnalyzed }} conversaciones de los últimos {{ r.days }} días</p>
          <p class="summary">{{ r.summary || 'Sin resumen.' }}</p>
        </section>

        @if (r.suggestions.length === 0) {
          <div class="card empty">La IA no encontró cambios que proponer en este periodo.</div>
        }
        @for (s of r.suggestions; track $index; let i = $index) {
          <article class="card suggestion" [class.done]="s.status !== 'pending'">
            <div class="suggestion-head">
              <h3>{{ s.title }}</h3>
              <span class="badge" [class.badge-success]="s.status === 'applied'" [class.badge-neutral]="s.status === 'discarded'" [class.badge-warning]="s.status === 'pending'">
                {{ statusLabel(s.status) }}
              </span>
            </div>
            <p class="problem">{{ s.problem }}</p>

            @if (s.evidence.length) {
              <ul class="evidence">
                @for (e of s.evidence; track $index) {
                  <li>
                    <a [routerLink]="['/inbox']" [queryParams]="{ c: e.conversationId }">
                      <lucide-icon [img]="MessageSquare" [size]="14"></lucide-icon> Ver conversación
                    </a>
                    <span>“{{ e.excerpt }}”</span>
                  </li>
                }
              </ul>
            }

            <div class="diff">
              @if (s.action !== 'add') {
                <div class="diff-block before">
                  <span class="diff-label">{{ s.action === 'remove' ? 'Se quita' : 'Antes' }}</span>
                  <pre>{{ s.find }}</pre>
                </div>
              }
              @if (s.action !== 'remove') {
                <div class="diff-block after">
                  <span class="diff-label">{{ s.action === 'add' ? 'Se agrega al final del prompt' : 'Después' }}</span>
                  <pre>{{ s.text }}</pre>
                </div>
              }
            </div>

            @if (s.status === 'pending') {
              <div class="actions">
                <button class="btn btn-sm btn-ghost" (click)="discard(i)" [disabled]="busy()">
                  <lucide-icon [img]="X" [size]="14"></lucide-icon> Descartar
                </button>
                <button class="btn btn-sm btn-primary" (click)="apply(i)" [disabled]="busy()">
                  <lucide-icon [img]="Check" [size]="14"></lucide-icon> Aplicar
                </button>
              </div>
            }
          </article>
        }
      } @else if (!loading() && !analyzing()) {
        <div class="card empty">Aún no hay análisis de este agente. Elige un periodo y pulsa «Analizar conversaciones».</div>
      }

      <section class="card history">
        <div class="history-head">
          <h2><lucide-icon [img]="History" [size]="18"></lucide-icon> Historial del prompt</h2>
          <button class="btn btn-sm btn-secondary" (click)="showCurrent.set(!showCurrent())">
            <lucide-icon [img]="showCurrent() ? EyeOff : Eye" [size]="14"></lucide-icon>
            {{ showCurrent() ? 'Ocultar' : 'Ver' }} prompt actual
          </button>
        </div>
        @if (showCurrent()) { <pre class="prompt-view current-prompt">{{ agent()?.systemPrompt }}</pre> }
        @if (versions().length === 0) {
          <p class="hint">Todavía no hay versiones anteriores. Cada cambio del prompt guarda aquí el texto que tenía antes.</p>
        }
        <ul class="versions">
          @for (v of versions(); track v._id) {
            <li class="version">
              <div class="version-row">
                <div>
                  <strong>{{ v.createdAt | date: 'dd/MM/yyyy HH:mm' }}</strong>
                  <span class="meta"> · reemplazada por: {{ sourceLabel(v.source) }}{{ v.note ? ' — ' + v.note : '' }}</span>
                </div>
                <div class="version-actions">
                  <button class="btn btn-sm btn-ghost" (click)="toggleVersion(v._id)">{{ openVersion() === v._id ? 'Ocultar' : 'Ver' }}</button>
                  <button class="btn btn-sm btn-secondary" (click)="restore(v)" [disabled]="busy()">
                    <lucide-icon [img]="RotateCcw" [size]="14"></lucide-icon> Restaurar
                  </button>
                </div>
              </div>
              @if (openVersion() === v._id) { <pre class="prompt-view">{{ v.prompt }}</pre> }
            </li>
          }
        </ul>
      </section>
    </div>
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; display: flex; flex-direction: column; gap: 20px; }
    .back-link { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-muted); text-decoration: none; font-weight: 600; font-size: 14px; }
    .back-link:hover { color: var(--color-brand); }
    .page-header h1 { font-family: var(--font-heading); margin: 0 0 4px; }
    .page-sub { margin: 0; color: var(--color-text-muted); }
    .card { padding: 24px; }
    .analyze-row { display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: var(--color-text-muted); }
    .field .select { min-width: 220px; }
    .review-picker { max-width: 420px; }
    .hint { margin: 12px 0 0; color: var(--color-text-muted); font-size: 13px; }
    h2 { margin: 0 0 6px; font-size: 18px; display: flex; align-items: center; gap: 8px; }
    h3 { margin: 0; font-size: 16px; }
    .meta { color: var(--color-text-muted); font-size: 13px; margin: 0 0 10px; }
    .summary { margin: 0; white-space: pre-wrap; line-height: 1.5; }
    .empty { color: var(--color-text-muted); text-align: center; }
    .suggestion { display: flex; flex-direction: column; gap: 12px; }
    .suggestion.done { opacity: .7; }
    .suggestion-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .problem { margin: 0; line-height: 1.5; }
    .evidence { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    .evidence li { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
    .evidence a { display: inline-flex; align-items: center; gap: 4px; color: var(--color-brand); font-weight: 600; text-decoration: none; }
    .evidence span { color: var(--color-text-muted); font-style: italic; }
    .diff { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .diff-block { border-radius: var(--radius-md); padding: 12px 14px; border: 1px solid var(--color-border); }
    .diff-block.before { background: color-mix(in srgb, var(--color-error) 7%, transparent); }
    .diff-block.after { background: color-mix(in srgb, var(--color-success) 9%, transparent); }
    .diff-label { display: block; font-size: 12px; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .3px; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: var(--font-base); font-size: 13px; line-height: 1.5; }
    .actions { display: flex; justify-content: flex-end; gap: 10px; }
    .history-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
    .versions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .version { border-top: 1px solid var(--color-border); padding: 12px 0; }
    .version-row { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
    .version-actions { display: flex; gap: 8px; }
    .prompt-view { margin-top: 10px; max-height: 420px; overflow: auto; background: var(--color-bg-light); border-radius: var(--radius-md); padding: 14px; border: 1px solid var(--color-border); }
    @media (max-width: 768px) { .page { padding: 20px 16px; } }
  `],
})
export class AgentImproveComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly ArrowLeft = ArrowLeft; readonly Sparkles = Sparkles; readonly Check = Check; readonly X = X;
  readonly History = History; readonly RotateCcw = RotateCcw; readonly MessageSquare = MessageSquare;
  readonly Eye = Eye; readonly EyeOff = EyeOff;

  readonly dayOptions = [7, 14, 30, 60, 90];
  days = 14;

  agentId = '';
  agent = signal<AgentLite | null>(null);
  reviews = signal<Review[]>([]);
  versions = signal<PromptVersion[]>([]);
  selectedId = signal<string | null>(null);
  current = computed<Review | null>(() => {
    const list = this.reviews();
    return list.find((r) => r._id === this.selectedId()) ?? list[0] ?? null;
  });
  loading = signal(true);
  analyzing = signal(false);
  busy = signal(false);
  showCurrent = signal(false);
  openVersion = signal<string | null>(null);

  ngOnInit() {
    this.agentId = this.route.snapshot.paramMap.get('id') ?? '';
    this.http.get<AgentLite>(`${API}/ai-agents/${this.agentId}`).subscribe({
      next: (a) => this.agent.set(a),
      error: (e: HttpErrorResponse) => this.toast.error(errorText(e, 'No se pudo cargar el agente')),
    });
    this.http.get<Review[]>(`${API}/ai-agents/${this.agentId}/reviews`).subscribe({
      next: (r) => { this.reviews.set(r); this.loading.set(false); },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error(errorText(e, 'No se pudieron cargar los análisis'));
      },
    });
    this.loadVersions();
  }

  private loadVersions() {
    this.http.get<PromptVersion[]>(`${API}/ai-agents/${this.agentId}/versions`).subscribe({
      next: (v) => this.versions.set(v),
      error: (e: HttpErrorResponse) => this.toast.error(errorText(e, 'No se pudo cargar el historial del prompt')),
    });
  }

  statusLabel(s: Suggestion['status']) {
    return s === 'applied' ? 'Aplicada' : s === 'discarded' ? 'Descartada' : 'Pendiente';
  }

  sourceLabel(s: PromptVersion['source']) { return SOURCE_LABEL[s]; }

  selectReview(id: string) { this.selectedId.set(id); }

  toggleVersion(id: string) { this.openVersion.set(this.openVersion() === id ? null : id); }

  analyze() {
    this.analyzing.set(true);
    this.http.post<Review>(`${API}/ai-agents/${this.agentId}/reviews`, { days: this.days }).subscribe({
      next: (r) => {
        this.reviews.set([r, ...this.reviews()]);
        this.selectedId.set(r._id);
        this.analyzing.set(false);
        this.toast.success(r.suggestions.length
          ? `Análisis listo: ${r.suggestions.length} sugerencias`
          : 'Análisis listo: sin cambios que proponer');
      },
      error: (e: HttpErrorResponse) => {
        this.analyzing.set(false);
        this.toast.error(errorText(e, 'No se pudo analizar el agente'));
      },
    });
  }

  private replaceReview(r: Review) {
    this.reviews.set(this.reviews().map((x) => (x._id === r._id ? r : x)));
  }

  async apply(index: number) {
    const review = this.current();
    if (!review) return;
    const s = review.suggestions[index];
    const ok = await this.confirm.confirm({
      title: 'Aplicar sugerencia',
      message: `Se cambiará el prompt del agente («${s.title}»). El texto anterior queda en el historial y puedes restaurarlo.`,
      confirmText: 'Aplicar',
    });
    if (!ok) return;
    this.busy.set(true);
    this.http
      .post<{ agent: AgentLite; review: Review }>(
        `${API}/ai-agents/${this.agentId}/reviews/${review._id}/suggestions/${index}/apply`, {},
      )
      .subscribe({
        next: (res) => {
          this.agent.set(res.agent);
          this.replaceReview(res.review);
          this.loadVersions();
          this.busy.set(false);
          this.toast.success('Sugerencia aplicada al prompt');
        },
        error: (e: HttpErrorResponse) => {
          this.busy.set(false);
          this.toast.error(errorText(e, 'No se pudo aplicar la sugerencia'));
        },
      });
  }

  async discard(index: number) {
    const review = this.current();
    if (!review) return;
    const ok = await this.confirm.confirm({
      title: 'Descartar sugerencia',
      message: 'La sugerencia se marcará como descartada y el prompt no cambia.',
      confirmText: 'Descartar',
    });
    if (!ok) return;
    this.busy.set(true);
    this.http
      .post<Review>(`${API}/ai-agents/${this.agentId}/reviews/${review._id}/suggestions/${index}/discard`, {})
      .subscribe({
        next: (r) => {
          this.replaceReview(r);
          this.busy.set(false);
          this.toast.success('Sugerencia descartada');
        },
        error: (e: HttpErrorResponse) => {
          this.busy.set(false);
          this.toast.error(errorText(e, 'No se pudo descartar la sugerencia'));
        },
      });
  }

  async restore(v: PromptVersion) {
    const ok = await this.confirm.confirm({
      title: 'Restaurar versión',
      message: 'El prompt actual se reemplazará por esta versión. El actual queda guardado en el historial.',
      confirmText: 'Restaurar',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.http.post<AgentLite>(`${API}/ai-agents/${this.agentId}/versions/${v._id}/restore`, {}).subscribe({
      next: (a) => {
        this.agent.set(a);
        this.loadVersions();
        this.busy.set(false);
        this.toast.success('Versión restaurada');
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.error(errorText(e, 'No se pudo restaurar la versión'));
      },
    });
  }
}
