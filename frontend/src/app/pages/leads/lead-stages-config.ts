import { Component, HostListener, OnInit, inject, input, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, X, Plus, Trash2, ChevronUp, ChevronDown, Trophy, Ban, Check,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export interface LeadStage {
  key: string;
  label: string;
  order: number;
  color: string;
  probability: number;
  outcome?: 'won' | 'lost';
}

/** Borrador editable de una etapa: lo guardado y lo que se está escribiendo. */
interface StageRow extends LeadStage {
  draftLabel: string;
  draftProbability: number;
}

/** Colores sugeridos para las columnas del tablero (son datos, no estilos de la UI). */
const SWATCHES = [
  '#6366F1', '#0EA5E9', '#8B5CF6', '#EC4899', '#F59E0B',
  '#F97316', '#14B8A6', '#10B981', '#EF4444', '#64748B',
];

/**
 * Panel lateral para configurar el embudo del tenant: renombrar, recolorear,
 * probabilidad, orden, altas y bajas de etapas. Cada cambio se guarda al
 * momento y avisa a la página (`changed`) para que recargue tablero y selects.
 */
@Component({
  selector: 'app-lead-stages-config',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="overlay" (click)="close.emit()" role="dialog" aria-modal="true" aria-labelledby="funnel-title">
      <aside class="drawer" (click)="$event.stopPropagation()">
        <div class="drawer-header">
          <div>
            <h2 id="funnel-title">Configurar embudo</h2>
            <p class="subtitle">Las etapas del seguimiento, en el orden del tablero. Ganado y Perdido cierran la oportunidad.</p>
          </div>
          <button class="btn btn-ghost btn-icon" (click)="close.emit()" aria-label="Cerrar">
            <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5" />
          </button>
        </div>

        <div class="drawer-scroll">
          @for (s of rows(); track s.key; let i = $index, first = $first, last = $last) {
            <div class="stage-row" [style.--stage]="s.color">
              <div class="row-main">
                <button class="swatch" [style.background]="s.color" (click)="togglePalette(s.key)"
                  [attr.aria-expanded]="paletteFor() === s.key" aria-label="Cambiar color"></button>
                <input class="input label-input" [(ngModel)]="s.draftLabel" maxlength="40"
                  (change)="saveLabel(s)" (keydown.enter)="$any($event.target).blur()" aria-label="Nombre de la etapa" />
                <div class="order-btns">
                  <button class="btn btn-ghost btn-icon btn-sm" [disabled]="first || busy()" (click)="move(i, -1)" aria-label="Subir">
                    <lucide-icon [img]="ChevronUp" [size]="16" [strokeWidth]="2.5" />
                  </button>
                  <button class="btn btn-ghost btn-icon btn-sm" [disabled]="last || busy()" (click)="move(i, 1)" aria-label="Bajar">
                    <lucide-icon [img]="ChevronDown" [size]="16" [strokeWidth]="2.5" />
                  </button>
                </div>
              </div>

              <div class="row-meta">
                @if (s.outcome === 'won') {
                  <span class="badge badge-success"><lucide-icon [img]="Trophy" [size]="12" [strokeWidth]="2.5" /> Ganado</span>
                } @else if (s.outcome === 'lost') {
                  <span class="badge badge-danger"><lucide-icon [img]="Ban" [size]="12" [strokeWidth]="2.5" /> Perdido</span>
                } @else {
                  <span class="badge badge-neutral">Abierta</span>
                }
                <label class="prob">
                  <span>Probabilidad</span>
                  <input class="input prob-input" type="number" min="0" max="100" step="5"
                    [(ngModel)]="s.draftProbability" (change)="saveProbability(s)" aria-label="Probabilidad de cierre" />
                  <span>%</span>
                </label>
                <span class="count">{{ countLabel(s.key) }}</span>
                @if (!s.outcome) {
                  <button class="btn btn-ghost btn-icon btn-sm danger" [disabled]="busy()" (click)="remove(s)" aria-label="Eliminar etapa">
                    <lucide-icon [img]="Trash2" [size]="15" [strokeWidth]="2.4" />
                  </button>
                }
              </div>

              @if (paletteFor() === s.key) {
                <div class="palette">
                  @for (c of swatches; track c) {
                    <button class="swatch sm" [style.background]="c" [class.on]="c.toLowerCase() === s.color.toLowerCase()"
                      (click)="saveColor(s, c)" [attr.aria-label]="'Color ' + c">
                      @if (c.toLowerCase() === s.color.toLowerCase()) {
                        <lucide-icon [img]="Check" [size]="12" [strokeWidth]="3" />
                      }
                    </button>
                  }
                  <label class="custom-color" title="Otro color">
                    <input type="color" [value]="s.color" (change)="saveColor(s, $any($event.target).value)" aria-label="Otro color" />
                  </label>
                </div>
              }
            </div>
          } @empty {
            <p class="muted">Cargando etapas…</p>
          }
        </div>

        <div class="drawer-footer">
          <input class="input" [(ngModel)]="newLabel" maxlength="40" placeholder="Nombre de la nueva etapa"
            (keydown.enter)="add()" aria-label="Nombre de la nueva etapa" />
          <button class="btn btn-primary" [disabled]="busy() || !newLabel.trim()" (click)="add()">
            <lucide-icon [img]="Plus" [size]="16" [strokeWidth]="2.5" /> Añadir etapa
          </button>
        </div>
      </aside>
    </div>

    <!-- Borrar una etapa con oportunidades: hay que elegir adónde pasan. -->
    @if (deleting(); as d) {
      <div class="overlay top" (click)="deleting.set(null)" role="dialog" aria-modal="true">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h3>Eliminar "{{ d.label }}"</h3>
          <p class="hint">
            {{ filtered() || countOf(d.key) === null
              ? 'Las oportunidades que tenga esta etapa se moverán a la que elijas.'
              : 'Tiene ' + countOf(d.key) + ' oportunidad(es). Elige a qué etapa moverlas antes de eliminarla.' }}
          </p>
          <label class="field-label" for="move-to">Mover a</label>
          <select id="move-to" class="select" [(ngModel)]="moveTo">
            @for (o of rows(); track o.key) {
              @if (o.key !== d.key) { <option [value]="o.key">{{ o.label }}</option> }
            }
          </select>
          <div class="actions">
            <button class="btn btn-secondary" (click)="deleting.set(null)">Cancelar</button>
            <button class="btn btn-danger" [disabled]="busy() || !moveTo" (click)="doRemove(d, moveTo)">Mover y eliminar</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .overlay.top { z-index: 110; }
    .drawer { margin-left: auto; height: 100%; width: min(520px, 100%); box-sizing: border-box; background: var(--color-white); display: flex; flex-direction: column;
      box-shadow: var(--shadow-lg); animation: slideIn var(--transition-spring); }
    @keyframes slideIn { from { transform: translateX(30px); opacity: 0; } to { transform: none; opacity: 1; } }
    .drawer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 24px 28px 16px; border-bottom: 1px solid var(--color-border); }
    .drawer-header h2 { margin: 0 0 4px; font-family: var(--font-heading); font-size: 20px; }
    .subtitle { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--color-text-muted); }
    .drawer-scroll { flex: 1; overflow-y: auto; padding: 18px 28px; display: flex; flex-direction: column; gap: 12px; }
    .drawer-footer { display: flex; gap: 10px; padding: 16px 28px calc(20px + var(--safe-bottom, 0px)); border-top: 1px solid var(--color-border); }
    .drawer-footer .input { flex: 1; min-width: 0; }

    .stage-row { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: var(--radius-md); background: var(--color-bg-light);
      border-left: 4px solid var(--stage); min-width: 0; }
    .row-main { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .label-input { flex: 1; min-width: 0; font-weight: 600; }
    .order-btns { display: flex; gap: 2px; flex-shrink: 0; }
    .row-meta { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .row-meta .badge { display: inline-flex; align-items: center; gap: 4px; }
    .prob { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-text-muted); }
    .prob-input { width: 84px; padding: 6px 6px 6px 12px; text-align: center; }
    .row-meta .badge, .prob { flex-shrink: 0; }
    .count { flex: 1; min-width: 0; font-size: 12px; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .danger { margin-left: auto; color: var(--color-error); }

    .swatch { width: 30px; height: 30px; border-radius: 50%; border: 3px solid var(--color-white); box-shadow: var(--shadow-sm); cursor: pointer; flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center; color: var(--color-white); padding: 0; transition: transform var(--transition-fast); }
    .swatch:hover { transform: scale(1.08); }
    .swatch.sm { width: 26px; height: 26px; }
    .swatch.on { box-shadow: 0 0 0 2px var(--color-text-main); }
    .palette { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 2px; }
    .custom-color { display: inline-flex; width: 26px; height: 26px; border-radius: 50%; overflow: hidden; border: 1.5px dashed var(--color-border); cursor: pointer; }
    .custom-color input { width: 40px; height: 40px; margin: -7px; border: 0; padding: 0; cursor: pointer; background: transparent; }

    .muted { color: var(--color-text-muted); font-size: 13px; }
    .modal-card { width: calc(100% - 48px); max-width: 480px; box-sizing: border-box; padding: 28px 32px; background: var(--color-white); border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg); display: flex; flex-direction: column; gap: 10px; animation: pop var(--transition-spring); }
    @keyframes pop { from { transform: scale(0.96); opacity: 0; } }
    .modal-card h3 { margin: 0; font-family: var(--font-heading); font-size: 18px; overflow-wrap: anywhere; }
    .hint { margin: 0; font-size: 13px; line-height: 1.5; color: var(--color-text-muted); }
    .field-label { font-size: 12px; font-weight: 600; margin-top: 4px; }
    .select { max-width: 100%; min-width: 0; }
    .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; flex-wrap: wrap; }

    @media (max-width: 640px) {
      .drawer { width: 100%; }
      .drawer-header { padding: calc(18px + var(--safe-top, 0px)) 16px 14px; }
      .drawer-scroll { padding: 14px 16px; }
      .drawer-footer { flex-direction: column; padding: 14px 16px calc(16px + var(--safe-bottom, 0px)); }
      .modal-card { padding: 24px 20px; }
    }
    @media (prefers-reduced-motion: reduce) { .drawer, .modal-card { animation: none; } }
  `],
})
export class LeadStagesConfigComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirmSvc = inject(ConfirmService);

  /** Oportunidades por etapa según el tablero cargado. */
  counts = input<Record<string, number>>({});
  /** El tablero tiene filtros: sus totales no son los de toda la etapa. */
  filtered = input(false);

  /** Algo cambió en el embudo: la página recarga etapas, tablero y KPIs. */
  changed = output<void>();
  close = output<void>();

  readonly X = X; readonly Plus = Plus; readonly Trash2 = Trash2; readonly ChevronUp = ChevronUp;
  readonly ChevronDown = ChevronDown; readonly Trophy = Trophy; readonly Ban = Ban; readonly Check = Check;
  readonly swatches = SWATCHES;

  rows = signal<StageRow[]>([]);
  busy = signal(false);
  paletteFor = signal<string | null>(null);
  deleting = signal<StageRow | null>(null);
  moveTo = '';
  newLabel = '';

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.deleting()) this.deleting.set(null);
    else this.close.emit();
  }

  ngOnInit() { this.reload(); }

  private reload() {
    this.http.get<LeadStage[]>(`${API}/leads/stages`).subscribe({
      next: s => this.rows.set(s.map(st => this.toRow(st))),
      error: err => this.toast.error(err?.error?.message || 'No se pudieron cargar las etapas'),
    });
  }

  private toRow(s: LeadStage): StageRow {
    return { ...s, draftLabel: s.label, draftProbability: s.probability };
  }

  /** Sustituye la fila por lo que devolvió el servidor. */
  private patchRow(updated: LeadStage) {
    this.rows.update(rows => rows.map(r => (r.key === updated.key ? this.toRow(updated) : r)));
  }

  countOf(key: string): number | null {
    const n = this.counts()[key];
    return n === undefined ? null : n;
  }

  countLabel(key: string): string {
    const n = this.countOf(key);
    if (n === null) return '';
    return `${n} ${n === 1 ? 'oportunidad' : 'oportunidades'}${this.filtered() ? ' (con filtros)' : ''}`;
  }

  togglePalette(key: string) {
    this.paletteFor.update(k => (k === key ? null : key));
  }

  private update(s: StageRow, body: Partial<Pick<LeadStage, 'label' | 'color' | 'probability'>>, ok: string) {
    this.busy.set(true);
    this.http.patch<LeadStage>(`${API}/leads/stages/${encodeURIComponent(s.key)}`, body).subscribe({
      next: updated => {
        this.busy.set(false);
        this.patchRow(updated);
        this.toast.success(ok);
        this.changed.emit();
      },
      error: err => {
        this.busy.set(false);
        // Vuelve a lo guardado: el borrador no vale.
        this.patchRow(s);
        this.toast.error(err?.error?.message || 'No se pudo guardar la etapa');
      },
    });
  }

  saveLabel(s: StageRow) {
    const label = s.draftLabel.trim();
    if (label === s.label) return;
    if (!label) {
      s.draftLabel = s.label;
      this.toast.error('La etapa necesita un nombre');
      return;
    }
    this.update(s, { label }, 'Etapa renombrada');
  }

  saveProbability(s: StageRow) {
    const p = Math.round(Number(s.draftProbability));
    if (p === s.probability) return;
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      s.draftProbability = s.probability;
      this.toast.error('La probabilidad va de 0 a 100');
      return;
    }
    this.update(s, { probability: p }, 'Probabilidad actualizada');
  }

  saveColor(s: StageRow, color: string) {
    if (!color || color.toLowerCase() === s.color.toLowerCase()) return;
    this.paletteFor.set(null);
    this.update(s, { color }, 'Color actualizado');
  }

  move(index: number, delta: -1 | 1) {
    const previous = this.rows();
    const target = index + delta;
    if (target < 0 || target >= previous.length) return;
    const next = [...previous];
    [next[index], next[target]] = [next[target], next[index]];
    this.rows.set(next);
    this.busy.set(true);
    this.http.patch<LeadStage[]>(`${API}/leads/stages/reorder`, { keys: next.map(r => r.key) }).subscribe({
      next: stages => {
        this.busy.set(false);
        this.rows.set(stages.map(st => this.toRow(st)));
        this.changed.emit();
      },
      error: err => {
        this.busy.set(false);
        this.rows.set(previous);
        this.toast.error(err?.error?.message || 'No se pudo reordenar');
      },
    });
  }

  add() {
    const label = this.newLabel.trim();
    if (!label || this.busy()) return;
    this.busy.set(true);
    this.http.post<LeadStage>(`${API}/leads/stages`, { label }).subscribe({
      next: created => {
        this.busy.set(false);
        this.newLabel = '';
        this.toast.success(`Etapa "${created.label}" añadida`);
        this.reload();
        this.changed.emit();
      },
      error: err => {
        this.busy.set(false);
        this.toast.error(err?.error?.message || 'No se pudo añadir la etapa');
      },
    });
  }

  async remove(s: StageRow) {
    const count = this.countOf(s.key);
    // Vacía de verdad (sin filtros en el tablero): basta con confirmar.
    if (!this.filtered() && count === 0) {
      const ok = await this.confirmSvc.confirm({
        title: 'Eliminar etapa',
        message: `Se quitará "${s.label}" del embudo.`,
        confirmText: 'Eliminar',
        danger: true,
      });
      if (ok) this.doRemove(s);
      return;
    }
    // Con oportunidades (o sin saberlo): hay que elegir adónde moverlas.
    const idx = this.rows().findIndex(r => r.key === s.key);
    const fallback = this.rows().slice(0, idx).reverse().find(r => !r.outcome)
      ?? this.rows().find(r => r.key !== s.key && !r.outcome)
      ?? this.rows().find(r => r.key !== s.key);
    this.moveTo = fallback?.key ?? '';
    this.deleting.set(s);
  }

  doRemove(s: StageRow, moveTo?: string) {
    this.busy.set(true);
    const query = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : '';
    this.http.delete<{ deleted: boolean; moved: number }>(`${API}/leads/stages/${encodeURIComponent(s.key)}${query}`).subscribe({
      next: res => {
        this.busy.set(false);
        this.deleting.set(null);
        this.toast.success(res.moved
          ? `Etapa eliminada · ${res.moved} oportunidad(es) movidas`
          : 'Etapa eliminada');
        this.reload();
        this.changed.emit();
      },
      error: err => {
        this.busy.set(false);
        this.toast.error(err?.error?.message || 'No se pudo eliminar la etapa');
      },
    });
  }
}
