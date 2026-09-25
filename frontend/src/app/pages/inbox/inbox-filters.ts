import { Component, computed, inject, model, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule, SlidersHorizontal, X, Bot, Tag, Check } from 'lucide-angular';
import { silentRequest } from '../../shared/loader';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export type InboxStatusFilter = 'all' | 'unread' | 'auto' | 'manual';

interface AgentOption { _id: string; name: string; published: boolean }

/**
 * Filtros de la bandeja. El estado (no leídos, agente/manual) se aplica en el
 * cliente sobre la lista cargada; el agente IA y las etiquetas van al servidor
 * porque cambian qué conversaciones se piden (`serverChange`).
 */
@Component({
  selector: 'app-inbox-filters',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="f-row">
      <div class="f-status" role="group" aria-label="Estado">
        @for (s of statuses; track s.key) {
          <button type="button" class="f-seg" [class.active]="status() === s.key" (click)="status.set(s.key)">{{ s.label }}</button>
        }
      </div>
      <button type="button" class="f-more" [class.on]="activeCount() > 0" (click)="openPanel()"
        aria-label="Más filtros" title="Filtrar por agente IA y etiquetas">
        <lucide-icon [img]="SlidersHorizontal" [size]="15" [strokeWidth]="2.4"></lucide-icon>
        <span class="f-more-label">Filtros</span>
        @if (activeCount() > 0) { <span class="f-badge">{{ activeCount() }}</span> }
      </button>
    </div>

    @if (activeCount() > 0) {
      <div class="f-active">
        @if (agentId()) {
          <button type="button" class="f-pill" (click)="agentId.set(''); serverChange.emit()" [attr.aria-label]="'Quitar filtro de agente ' + agentName()">
            <lucide-icon [img]="Bot" [size]="12" [strokeWidth]="2.5"></lucide-icon>
            {{ agentName() }}
            <lucide-icon [img]="X" [size]="12" [strokeWidth]="2.8"></lucide-icon>
          </button>
        }
        @for (t of tags(); track t) {
          <button type="button" class="f-pill" (click)="removeTag(t)" [attr.aria-label]="'Quitar etiqueta ' + t">
            <lucide-icon [img]="Tag" [size]="12" [strokeWidth]="2.5"></lucide-icon>
            {{ t }}
            <lucide-icon [img]="X" [size]="12" [strokeWidth]="2.8"></lucide-icon>
          </button>
        }
        <button type="button" class="f-clear" (click)="clear()">Limpiar</button>
      </div>
    }

    @if (panel()) {
      <div class="f-overlay" (click)="panel.set(false)" role="dialog" aria-modal="true" aria-label="Filtros">
        <div class="f-panel" (click)="$event.stopPropagation()">
          <div class="sheet-grip f-grip" aria-hidden="true"></div>
          <div class="f-head">
            <h2>Filtros</h2>
            <button type="button" class="btn-icon btn-ghost" (click)="panel.set(false)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.4"></lucide-icon>
            </button>
          </div>

          <div class="f-body">
            <span class="f-label">Agente IA</span>
            <div class="f-options">
              <button type="button" class="f-opt" [class.active]="!draftAgent()" (click)="draftAgent.set('')">Cualquiera</button>
              @for (a of agents(); track a._id) {
                <button type="button" class="f-opt" [class.active]="draftAgent() === a._id" (click)="draftAgent.set(a._id)">
                  <lucide-icon [img]="Bot" [size]="13" [strokeWidth]="2.4"></lucide-icon>
                  {{ a.name }}@if (!a.published) { <em> · borrador</em> }
                </button>
              }
              @if (agents().length === 0) { <small class="f-none">No hay agentes creados.</small> }
            </div>

            <span class="f-label">Etiquetas</span>
            <div class="f-options">
              @for (t of knownTags(); track t) {
                <button type="button" class="f-opt" [class.active]="draftTags().includes(t)" (click)="toggleTag(t)">
                  @if (draftTags().includes(t)) { <lucide-icon [img]="Check" [size]="13" [strokeWidth]="2.8"></lucide-icon> }
                  {{ t }}
                </button>
              }
              @if (knownTags().length === 0) { <small class="f-none">Aún no hay contactos etiquetados.</small> }
            </div>
            @if (draftTags().length > 1) { <small class="f-none">Se muestran los chats con cualquiera de las etiquetas elegidas.</small> }
          </div>

          <div class="f-actions">
            <button type="button" class="btn btn-secondary" (click)="draftAgent.set(''); draftTags.set([])">Limpiar</button>
            <button type="button" class="btn btn-primary" (click)="apply()">Aplicar</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .f-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .f-status {
      flex: 1; min-width: 0; display: flex; gap: 3px; padding: 3px;
      border-radius: var(--radius-pill); background: var(--color-bg-app); border: 1px solid var(--color-border);
      overflow-x: auto; scrollbar-width: none;
    }
    .f-status::-webkit-scrollbar { display: none; }
    .f-seg {
      flex: 1 0 auto; border: none; background: none; cursor: pointer; white-space: nowrap;
      padding: 6px 10px; border-radius: var(--radius-pill); font-family: var(--font-base);
      font-size: 12.5px; font-weight: 600; color: var(--color-text-muted); transition: all var(--transition-fast);
    }
    .f-seg:hover { color: var(--color-text-main); }
    .f-seg.active { background: var(--color-white); color: var(--color-brand); box-shadow: var(--shadow-sm); }
    .f-more {
      flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
      padding: 7px 12px; border-radius: var(--radius-pill); border: 1px solid var(--color-border);
      background: var(--color-white); font-family: var(--font-base); font-size: 12.5px; font-weight: 600;
      color: var(--color-text-main); transition: all var(--transition-fast);
    }
    .f-more:hover, .f-more.on { border-color: var(--color-brand); color: var(--color-brand); }
    .f-more.on { background: var(--color-brand-light); }
    .f-badge {
      background: var(--color-brand); color: var(--color-white); border-radius: var(--radius-pill);
      font-size: 10.5px; font-weight: 700; padding: 1px 6px;
    }
    .f-active { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .f-pill {
      display: inline-flex; align-items: center; gap: 5px; max-width: 100%; cursor: pointer;
      padding: 4px 10px; border-radius: var(--radius-pill); border: none;
      background: var(--color-brand-light); color: var(--color-brand);
      font-family: var(--font-base); font-size: 12px; font-weight: 600;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .f-clear {
      border: none; background: none; cursor: pointer; font-family: var(--font-base);
      font-size: 12px; font-weight: 600; color: var(--color-text-muted); padding: 4px 6px;
    }
    .f-clear:hover { color: var(--color-brand); }

    .f-overlay {
      position: fixed; inset: 0; z-index: 100; background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center;
    }
    .f-panel {
      width: calc(100% - 48px); max-width: 480px; max-height: calc(100dvh - 48px); box-sizing: border-box;
      background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
      padding: 24px 28px; display: flex; flex-direction: column; gap: 14px;
      animation: fadeInUp var(--transition-spring);
    }
    .f-grip { display: none; }
    .f-head { display: flex; align-items: center; justify-content: space-between; }
    .f-head h2 { margin: 0; font-family: var(--font-heading); font-size: 19px; }
    .f-body { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; min-height: 0; }
    .f-label {
      font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--color-text-muted); margin-top: 4px;
    }
    .f-options { display: flex; flex-wrap: wrap; gap: 6px; }
    .f-opt {
      display: inline-flex; align-items: center; gap: 5px; cursor: pointer; max-width: 100%;
      padding: 7px 13px; border-radius: var(--radius-pill); border: 1px solid var(--color-border);
      background: var(--color-white); font-family: var(--font-base); font-size: 13px; font-weight: 600;
      color: var(--color-text-main); overflow-wrap: anywhere; transition: all var(--transition-fast);
    }
    .f-opt em { font-style: normal; font-weight: 500; color: var(--color-text-muted); }
    .f-opt:hover { border-color: var(--color-brand); }
    .f-opt.active { background: var(--color-brand); border-color: var(--color-brand); color: var(--color-white); }
    .f-opt.active em { color: inherit; opacity: 0.8; }
    .f-none { font-size: 12.5px; color: var(--color-text-muted); }
    .f-actions { display: flex; justify-content: flex-end; gap: 10px; }

    @media (max-width: 640px) {
      .f-more-label { display: none; }
      .f-seg { font-size: 13.5px; padding: 7px 12px; }
      .f-overlay { align-items: flex-end; }
      .f-panel {
        width: 100%; max-width: none; max-height: 88dvh;
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        padding: 12px 20px calc(20px + var(--safe-bottom));
        animation: sheetUp var(--transition-spring);
      }
      .f-grip { display: block; margin-bottom: 0; }
      .f-actions .btn { flex: 1; }
    }
  `],
})
export class InboxFiltersComponent {
  private http = inject(HttpClient);

  status = model<InboxStatusFilter>('all');
  agentId = model('');
  tags = model<string[]>([]);
  /** Cambió un filtro que se resuelve en el servidor: hay que volver a pedir la lista. */
  serverChange = output<void>();

  readonly SlidersHorizontal = SlidersHorizontal;
  readonly X = X;
  readonly Bot = Bot;
  readonly Tag = Tag;
  readonly Check = Check;

  readonly statuses: { key: InboxStatusFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'unread', label: 'No leídos' },
    { key: 'auto', label: 'Con IA' },
    { key: 'manual', label: 'Manual' },
  ];

  agents = signal<AgentOption[]>([]);
  knownTags = signal<string[]>([]);
  panel = signal(false);
  draftAgent = signal('');
  draftTags = signal<string[]>([]);

  activeCount = computed(() => (this.agentId() ? 1 : 0) + this.tags().length);
  agentName = computed(() => this.agents().find(a => a._id === this.agentId())?.name ?? 'Agente IA');

  constructor() {
    this.loadOptions();
  }

  private loadOptions() {
    const ctx = { context: silentRequest() };
    this.http.get<AgentOption[]>(`${API}/conversations/agents`, ctx).subscribe({
      next: list => this.agents.set(list), error: () => this.agents.set([]),
    });
    this.http.get<string[]>(`${API}/conversations/tags`, ctx).subscribe({
      next: list => this.knownTags.set(list), error: () => this.knownTags.set([]),
    });
  }

  openPanel() {
    this.draftAgent.set(this.agentId());
    this.draftTags.set([...this.tags()]);
    // Las etiquetas cambian al clasificar chats: se refrescan al abrir.
    this.loadOptions();
    this.panel.set(true);
  }

  toggleTag(t: string) {
    this.draftTags.update(list => (list.includes(t) ? list.filter(x => x !== t) : [...list, t]));
  }

  apply() {
    this.agentId.set(this.draftAgent());
    this.tags.set(this.draftTags());
    this.panel.set(false);
    this.serverChange.emit();
  }

  removeTag(t: string) {
    this.tags.update(list => list.filter(x => x !== t));
    this.serverChange.emit();
  }

  clear() {
    this.agentId.set('');
    this.tags.set([]);
    this.serverChange.emit();
  }
}
