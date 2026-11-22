import { Component, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, FileText, Send, X } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { silentRequest } from '../../shared/loader';
import { newClientId } from '../../shared/outbox';
import { renderTemplate } from './wa-window';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

/** Plantilla aprobada que se puede enviar por la cuenta del chat. */
export interface ChatTemplate {
  _id: string;
  name: string;
  language: string;
  category?: string;
  body: string;
  headerType?: string;
  headerText?: string;
  footer?: string;
  variables: number;
  headerVariable: boolean;
}

const CATEGORY: Record<string, string> = {
  UTILITY: 'Utilidad',
  MARKETING: 'Marketing',
};

/**
 * Enviar una plantilla aprobada de WhatsApp desde el chat (HU27). Es lo único
 * que Meta acepta pasadas 24 h del último mensaje del cliente; cuando este
 * responde, la conversación vuelve a abrirse.
 */
@Component({
  selector: 'app-wa-template-picker',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="overlay tp-overlay" (click)="closed.emit()" role="dialog" aria-modal="true" aria-labelledby="tp-title">
      <div class="card tp-modal" (click)="$event.stopPropagation()">
        <div class="tp-head">
          <h2 id="tp-title">
            <lucide-icon [img]="FileText" [size]="20" [strokeWidth]="2.3"></lucide-icon>
            Enviar plantilla
          </h2>
          <button type="button" class="btn-icon btn-ghost" (click)="closed.emit()" aria-label="Cerrar">
            <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.4"></lucide-icon>
          </button>
        </div>

        <p class="tp-text">
          WhatsApp solo permite escribir libremente hasta 24 h después del último mensaje del cliente.
          Con una plantilla aprobada puedes volver a contactarle; cuando responda, podrás escribirle normal.
        </p>

        @if (loading()) {
          <p class="tp-empty">Cargando plantillas…</p>
        } @else if (!templates().length) {
          <p class="tp-empty">
            Esta cuenta no tiene plantillas aprobadas. Créalas en <strong>Plantillas de WhatsApp</strong>;
            Meta suele aprobarlas en minutos.
          </p>
        } @else {
          <label class="tp-field">
            <span>Plantilla</span>
            <select class="select" [ngModel]="selectedId()" (ngModelChange)="choose($event)" aria-label="Plantilla">
              <option value="" disabled>Elige una plantilla</option>
              @for (t of templates(); track t._id) {
                <option [value]="t._id">{{ t.name }} · {{ t.language }}{{ categoryLabel(t) }}</option>
              }
            </select>
          </label>

          @if (selected(); as t) {
            @if (t.headerVariable) {
              <label class="tp-field">
                <span>Cabecera</span>
                <input class="input" [(ngModel)]="headerText" maxlength="60" placeholder="Texto de la cabecera" />
              </label>
            }
            @for (v of vars(); track $index) {
              <label class="tp-field">
                <span>Variable {{ '{{' }}{{ $index + 1 }}{{ '}}' }}</span>
                <input class="input" [ngModel]="v" (ngModelChange)="setVar($index, $event)" maxlength="1024" />
              </label>
            }

            <div class="tp-preview" aria-label="Vista previa">
              @if (t.headerType === 'TEXT' && t.headerText) {
                <strong>{{ headerPreview() }}</strong>
              } @else if (t.headerType) {
                <em>[{{ t.headerType.toLowerCase() }} de la plantilla]</em>
              }
              <span>{{ preview() }}</span>
              @if (t.footer) { <small>{{ t.footer }}</small> }
            </div>
          }
        }

        <div class="tp-actions">
          <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancelar</button>
          <button type="button" class="btn btn-primary" [disabled]="!canSend()" (click)="send()">
            <lucide-icon [img]="Send" [size]="16" [strokeWidth]="2.4"></lucide-icon>
            {{ sending() ? 'Enviando…' : 'Enviar' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tp-overlay {
      position: fixed; inset: 0; z-index: 110;
      background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
    }
    .tp-modal {
      width: calc(100% - 48px); max-width: 480px; max-height: calc(100vh - 48px); overflow-y: auto;
      box-sizing: border-box; padding: 28px 32px; display: flex; flex-direction: column; gap: 16px;
      animation: fadeInUp var(--transition-spring);
    }
    .tp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .tp-head h2 {
      margin: 0; display: flex; align-items: center; gap: 8px;
      font-family: var(--font-heading); font-size: 19px;
    }
    .tp-text, .tp-empty { margin: 0; font-size: 14px; line-height: 1.5; color: var(--color-text-muted); }
    .tp-field { display: flex; flex-direction: column; gap: 6px; }
    .tp-field > span { font-size: 12.5px; font-weight: 600; }
    .tp-preview {
      display: flex; flex-direction: column; gap: 6px; padding: 14px 16px;
      border-radius: var(--radius-lg); background: var(--color-bg-light);
      font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
    }
    .tp-preview small, .tp-preview em { color: var(--color-text-muted); font-size: 12px; }
    .tp-actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
    @media (max-width: 600px) { .tp-modal { padding: 24px 20px; } }
  `],
})
export class WaTemplatePickerComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  conversationId = input.required<string>();
  /** Se propone como `{{1}}`, que casi siempre es el nombre. */
  contactName = input<string | undefined>();
  closed = output<void>();
  sent = output<unknown>();

  readonly FileText = FileText;
  readonly Send = Send;
  readonly X = X;

  loading = signal(true);
  sending = signal(false);
  templates = signal<ChatTemplate[]>([]);
  selectedId = signal('');
  vars = signal<string[]>([]);
  headerText = '';

  selected = computed(() => this.templates().find(t => t._id === this.selectedId()) ?? null);
  preview = computed(() => renderTemplate(this.selected()?.body ?? '', this.vars()));
  canSend = computed(() => {
    const t = this.selected();
    return !!t && !this.sending() && this.vars().every(v => !!v.trim());
  });

  @HostListener('document:keydown.escape')
  onEsc() { this.closed.emit(); }

  ngOnInit() {
    this.http.get<ChatTemplate[]>(`${API}/conversations/${this.conversationId()}/templates`, { context: silentRequest() })
      .subscribe({
        next: list => {
          this.templates.set(list);
          this.loading.set(false);
          if (list.length === 1) this.choose(list[0]._id);
        },
        error: err => {
          this.loading.set(false);
          this.toast.error(err.error?.message || 'No se pudieron cargar las plantillas');
        },
      });
  }

  categoryLabel(t: ChatTemplate): string {
    const c = t.category && CATEGORY[t.category];
    return c ? ` · ${c}` : '';
  }

  choose(id: string) {
    this.selectedId.set(id);
    const t = this.selected();
    const name = this.contactName()?.trim().split(/\s+/)[0] ?? '';
    this.vars.set(Array.from({ length: t?.variables ?? 0 }, (_, i) => (i === 0 ? name : '')));
    this.headerText = '';
  }

  setVar(i: number, value: string) {
    this.vars.update(list => list.map((v, j) => (j === i ? value : v)));
  }

  headerPreview(): string {
    return renderTemplate(this.selected()?.headerText ?? '', [this.headerText]);
  }

  send() {
    const t = this.selected();
    if (!t || !this.canSend()) return;
    if (t.headerVariable && !this.headerText.trim()) {
      this.toast.error('Escribe el texto de la cabecera');
      return;
    }
    this.sending.set(true);
    const body = {
      templateId: t._id,
      variables: this.vars().map(v => v.trim()),
      ...(t.headerVariable ? { headerText: this.headerText.trim() } : {}),
      clientId: newClientId(),
    };
    this.http.post(`${API}/conversations/${this.conversationId()}/messages/template`, body, { context: silentRequest() })
      .subscribe({
        next: msg => {
          this.sending.set(false);
          this.toast.success('Plantilla enviada');
          this.sent.emit(msg);
        },
        error: err => {
          this.sending.set(false);
          this.toast.error(err.error?.message || 'No se pudo enviar la plantilla');
        },
      });
  }
}
