import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  LucideAngularModule, CalendarPlus, PhoneCall, CalendarClock, ListTodo, ListChecks,
  X, Video, Clock, Check, Trash2, AlertCircle,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { ConversationsRealtimeService } from '../../shared/conversations-realtime';
import { silentRequest } from '../../shared/loader';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export type ActionKind = 'call' | 'callback' | 'task' | 'schedule' | 'pending';

/** Lo mínimo de la conversación que necesitan los accesos directos. */
export interface ActionConv {
  _id: string;
  channel: string;
  contact: string;
  contactName?: string;
}

export interface ActionAttachment {
  url: string; key?: string; type: string; mimeType: string; filename: string; size: number;
}

interface CalendarConnection {
  _id: string; provider: 'google' | 'microsoft'; email: string; name?: string; isDefault: boolean;
}

interface CalendarEvent {
  provider: 'google' | 'microsoft'; eventId: string; htmlLink?: string; joinUrl?: string;
  start: string; end: string; connectionEmail: string;
}

interface ConvTask {
  _id: string; leadId: string; leadTitle: string; title: string; body?: string; dueAt?: string; done: boolean;
}

interface Scheduled {
  _id: string; sendAt: string; status: 'pending' | 'sending' | 'failed'; text: string;
  subject?: string; type: string; filename?: string; error?: string;
}

interface Preset { label: string; at: Date }

/** 'YYYY-MM-DDTHH:mm' en hora local, que es lo que entiende <input type="datetime-local">. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function at(daysFromToday: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Accesos directos del chat: agendar una llamada (con Meet o Teams si hay un
 * calendario conectado), recordar volver a llamar, crear una tarea y programar
 * el envío de un mensaje o correo. Las tareas se guardan en la oportunidad del
 * contacto, así que también aparecen en la agenda de Seguimiento.
 *
 * Vive aparte de la bandeja para no cargar más su plantilla ni sus estilos.
 */
@Component({
  selector: 'app-inbox-actions',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, RouterLink],
  template: `
    <div class="qa-bar" role="toolbar" aria-label="Accesos directos">
      <button type="button" class="qa-chip" (click)="open('call')" title="Agendar llamada o videollamada">
        <lucide-icon [img]="CalendarPlus" [size]="15" [strokeWidth]="2.3"></lucide-icon> Agendar llamada
      </button>
      <button type="button" class="qa-chip" (click)="open('callback')" title="Recordatorio para volver a llamar">
        <lucide-icon [img]="PhoneCall" [size]="15" [strokeWidth]="2.3"></lucide-icon> Volver a llamar
      </button>
      <button type="button" class="qa-chip" (click)="open('schedule')" [title]="isEmail() ? 'Programar el envío de un correo' : 'Programar el envío de un mensaje'">
        <lucide-icon [img]="CalendarClock" [size]="15" [strokeWidth]="2.3"></lucide-icon> {{ isEmail() ? 'Programar correo' : 'Programar mensaje' }}
      </button>
      <button type="button" class="qa-chip" (click)="open('task')" title="Crear una tarea de seguimiento">
        <lucide-icon [img]="ListTodo" [size]="15" [strokeWidth]="2.3"></lucide-icon> Tarea
      </button>
      @if (pendingCount() > 0) {
        <button type="button" class="qa-chip pending" [class.overdue]="overdueCount() > 0" (click)="open('pending')" title="Tareas y envíos programados de este chat">
          <lucide-icon [img]="ListChecks" [size]="15" [strokeWidth]="2.3"></lucide-icon>
          Pendientes <span class="qa-count">{{ pendingCount() }}</span>
        </button>
      }
    </div>

    @if (modal(); as m) {
      <div class="overlay qa-overlay" (click)="close()" role="dialog" aria-modal="true">
        <div class="card qa-modal" (click)="$event.stopPropagation()">
          <div class="sheet-grip qa-grip" aria-hidden="true"></div>
          <div class="qa-head">
            <h2>{{ title(m) }}</h2>
            <button type="button" class="btn-icon btn-ghost" (click)="close()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.4"></lucide-icon>
            </button>
          </div>

          @switch (m) {
            @case ('call') {
              <div class="qa-body">
                <label class="qa-field">
                  <span>Asunto</span>
                  <input class="input" [(ngModel)]="callTitle" maxlength="200" />
                </label>
                <div class="qa-presets">
                  @for (p of presets(); track p.label) {
                    <button type="button" class="qa-preset" [class.active]="when === toInput(p.at)" (click)="when = toInput(p.at)">{{ p.label }}</button>
                  }
                </div>
                <div class="qa-row">
                  <label class="qa-field">
                    <span>Fecha y hora</span>
                    <input class="input" type="datetime-local" [(ngModel)]="when" [min]="minWhen()" />
                  </label>
                  <label class="qa-field qa-narrow">
                    <span>Duración</span>
                    <select class="select" [(ngModel)]="duration">
                      @for (d of durations; track d) { <option [ngValue]="d">{{ d }} min</option> }
                    </select>
                  </label>
                </div>
                <label class="qa-field">
                  <span>Videollamada</span>
                  <select class="select" [(ngModel)]="connectionId">
                    <option value="">Sin videollamada (solo recordatorio)</option>
                    @for (c of connections(); track c._id) {
                      <option [value]="c._id">{{ c.provider === 'google' ? 'Google Meet' : 'Microsoft Teams' }} · {{ c.email }}</option>
                    }
                  </select>
                  @if (!loadingConnections() && connections().length === 0) {
                    <small class="qa-hint">
                      <lucide-icon [img]="Video" [size]="13" [strokeWidth]="2.3"></lucide-icon>
                      Conecta Google Calendar o Microsoft Teams en
                      <a routerLink="/settings" (click)="close()">Configuración</a> para crear el enlace de la reunión.
                    </small>
                  }
                </label>
                @if (connectionId) {
                  <label class="qa-field">
                    <span>Correo del invitado <em>(opcional)</em></span>
                    <input class="input" type="email" [(ngModel)]="attendee" placeholder="cliente@correo.com" />
                  </label>
                  <label class="qa-check">
                    <input type="checkbox" [(ngModel)]="sendLink" />
                    <span>Enviar el enlace al cliente por este chat</span>
                  </label>
                }
                <label class="qa-field">
                  <span>Notas <em>(opcional)</em></span>
                  <textarea class="textarea" rows="2" [(ngModel)]="notes" maxlength="2000"></textarea>
                </label>
              </div>
            }

            @case ('schedule') {
              <div class="qa-body">
                @if (isEmail()) {
                  <label class="qa-field">
                    <span>Asunto <em>(opcional)</em></span>
                    <input class="input" [(ngModel)]="schedSubject" maxlength="250" placeholder="Re: …" />
                  </label>
                }
                <label class="qa-field">
                  <span>{{ isEmail() ? 'Correo' : 'Mensaje' }}</span>
                  <textarea class="textarea" rows="4" [(ngModel)]="schedText" maxlength="4096"
                    placeholder="Escribe lo que quieres enviar…"></textarea>
                </label>
                @if (attachment(); as att) {
                  <div class="qa-att">Adjunto: <strong>{{ att.filename }}</strong></div>
                }
                <div class="qa-presets">
                  @for (p of presets(); track p.label) {
                    <button type="button" class="qa-preset" [class.active]="when === toInput(p.at)" (click)="when = toInput(p.at)">{{ p.label }}</button>
                  }
                </div>
                <label class="qa-field">
                  <span>Enviar el</span>
                  <input class="input" type="datetime-local" [(ngModel)]="when" [min]="minWhen()" />
                </label>
              </div>
            }

            @case ('pending') {
              <div class="qa-body qa-list">
                @if (tasks().length) {
                  <span class="qa-section">Tareas</span>
                  @for (t of tasks(); track t._id) {
                    <div class="qa-item" [class.late]="isLate(t.dueAt)">
                      <button type="button" class="qa-done" (click)="completeTask(t)" title="Marcar como hecha" aria-label="Marcar como hecha">
                        <lucide-icon [img]="Check" [size]="14" [strokeWidth]="3"></lucide-icon>
                      </button>
                      <div class="qa-item-body">
                        <strong>{{ t.title }}</strong>
                        <small>
                          @if (isLate(t.dueAt)) { <lucide-icon [img]="AlertCircle" [size]="12" [strokeWidth]="2.5"></lucide-icon> Vencida · }
                          {{ fmt(t.dueAt) }}
                        </small>
                      </div>
                    </div>
                  }
                }
                @if (scheduled().length) {
                  <span class="qa-section">Envíos programados</span>
                  @for (s of scheduled(); track s._id) {
                    <div class="qa-item" [class.late]="s.status === 'failed'">
                      <span class="qa-item-icon"><lucide-icon [img]="Clock" [size]="15" [strokeWidth]="2.3"></lucide-icon></span>
                      <div class="qa-item-body">
                        <strong>{{ s.text || s.filename || 'Adjunto' }}</strong>
                        <small>
                          @if (s.status === 'failed') { No se pudo enviar · } @else if (s.status === 'sending') { Enviando… · }
                          {{ fmt(s.sendAt) }}
                        </small>
                      </div>
                      @if (s.status !== 'sending') {
                        <button type="button" class="btn-icon btn-ghost danger" (click)="cancelScheduled(s)" aria-label="Cancelar envío">
                          <lucide-icon [img]="Trash2" [size]="16" [strokeWidth]="2.2"></lucide-icon>
                        </button>
                      }
                    </div>
                  }
                }
                @if (!tasks().length && !scheduled().length) {
                  <p class="qa-empty">No hay nada pendiente en este chat.</p>
                }
              </div>
            }

            @default {
              <div class="qa-body">
                <label class="qa-field">
                  <span>{{ m === 'callback' ? 'Recordatorio' : 'Tarea' }}</span>
                  <input class="input" [(ngModel)]="taskTitle" maxlength="200" />
                </label>
                <div class="qa-presets">
                  @for (p of presets(); track p.label) {
                    <button type="button" class="qa-preset" [class.active]="when === toInput(p.at)" (click)="when = toInput(p.at)">{{ p.label }}</button>
                  }
                </div>
                <label class="qa-field">
                  <span>Vence el</span>
                  <input class="input" type="datetime-local" [(ngModel)]="when" [min]="minWhen()" />
                </label>
                <label class="qa-field">
                  <span>Notas <em>(opcional)</em></span>
                  <textarea class="textarea" rows="2" [(ngModel)]="notes" maxlength="2000"></textarea>
                </label>
                <label class="qa-check">
                  <input type="checkbox" [(ngModel)]="remindWa" />
                  <span>Avisarme también por WhatsApp</span>
                </label>
              </div>
            }
          }

          @if (m !== 'pending') {
            <div class="qa-actions">
              <button type="button" class="btn btn-secondary" (click)="close()">Cancelar</button>
              <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="submit(m)">
                {{ saving() ? 'Guardando…' : submitLabel(m) }}
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .qa-bar {
      display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;
      margin: 0 -4px; padding: 0 4px 2px;
    }
    .qa-bar::-webkit-scrollbar { display: none; }
    .qa-chip {
      flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: var(--radius-pill);
      border: 1px solid var(--color-border); background: var(--color-white);
      color: var(--color-text-main); font-size: 12.5px; font-weight: 600;
      font-family: var(--font-base); cursor: pointer; white-space: nowrap;
      transition: all var(--transition-fast);
    }
    .qa-chip lucide-icon { color: var(--color-brand); }
    .qa-chip:hover { border-color: var(--color-brand); background: var(--color-brand-light); }
    .qa-chip.pending { background: var(--color-bg-light); }
    .qa-chip.overdue { border-color: var(--color-error); color: var(--color-error); }
    .qa-chip.overdue lucide-icon { color: var(--color-error); }
    .qa-count {
      background: var(--color-brand); color: var(--color-white); border-radius: var(--radius-pill);
      font-size: 10.5px; font-weight: 700; padding: 1px 7px;
    }
    .qa-chip.overdue .qa-count { background: var(--color-error); }

    .qa-overlay {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
    }
    .qa-modal {
      width: calc(100% - 48px); max-width: 480px; max-height: calc(100dvh - 48px);
      box-sizing: border-box; padding: 24px 28px; display: flex; flex-direction: column; gap: 16px;
      animation: fadeInUp var(--transition-spring);
    }
    .qa-grip { display: none; }
    .qa-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .qa-head h2 { margin: 0; font-family: var(--font-heading); font-size: 19px; }
    .qa-body { display: flex; flex-direction: column; gap: 14px; overflow-y: auto; min-height: 0; }
    .qa-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
    .qa-field > span { font-size: 12.5px; font-weight: 600; }
    .qa-field em { font-style: normal; font-weight: 500; color: var(--color-text-muted); }
    .qa-field .select, .qa-field .input { width: 100%; min-width: 0; box-sizing: border-box; }
    .qa-row { display: flex; gap: 12px; }
    .qa-narrow { flex: 0 0 120px; }
    .qa-hint { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; font-size: 12px; color: var(--color-text-muted); }
    .qa-hint a { color: var(--color-brand); font-weight: 600; }
    .qa-presets { display: flex; gap: 6px; flex-wrap: wrap; }
    .qa-preset {
      border: 1px solid var(--color-border); background: var(--color-white); cursor: pointer;
      border-radius: var(--radius-pill); padding: 6px 12px; font-size: 12.5px; font-weight: 600;
      color: var(--color-text-muted); font-family: var(--font-base);
    }
    .qa-preset.active, .qa-preset:hover { border-color: var(--color-brand); color: var(--color-brand); background: var(--color-brand-light); }
    .qa-check { display: flex; align-items: center; gap: 10px; font-size: 13.5px; cursor: pointer; }
    .qa-check input { width: 18px; height: 18px; accent-color: var(--color-brand); }
    .qa-att { font-size: 12.5px; color: var(--color-text-muted); overflow-wrap: anywhere; }
    .qa-actions { display: flex; justify-content: flex-end; gap: 10px; }

    .qa-list { gap: 8px; }
    .qa-section {
      font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--color-text-muted); margin-top: 4px;
    }
    .qa-item {
      display: flex; align-items: center; gap: 12px; padding: 10px 12px;
      border-radius: var(--radius-md); background: var(--color-bg-light);
    }
    .qa-item.late small { color: var(--color-error); }
    .qa-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .qa-item-body strong {
      font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .qa-item-body small { font-size: 12px; color: var(--color-text-muted); display: inline-flex; align-items: center; gap: 4px; }
    .qa-item-icon, .qa-done {
      width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: var(--color-white); color: var(--color-text-muted); border: 1px solid var(--color-border);
    }
    .qa-done { cursor: pointer; transition: all var(--transition-fast); }
    .qa-done:hover { background: var(--color-success); border-color: var(--color-success); color: var(--color-white); }
    .qa-empty { margin: 8px 0; text-align: center; color: var(--color-text-muted); font-size: 13.5px; }

    /* En el teléfono los formularios suben como hoja inferior. */
    @media (max-width: 640px) {
      .qa-overlay { align-items: flex-end; }
      .qa-modal {
        width: 100%; max-width: none; max-height: 92dvh;
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        padding: 12px 20px calc(20px + var(--safe-bottom));
        animation: sheetUp var(--transition-spring);
      }
      .qa-grip { display: block; margin-bottom: 0; }
      .qa-row { flex-direction: column; }
      .qa-narrow { flex: 1; }
      .qa-actions .btn { flex: 1; }
      .qa-field .input, .qa-field .select, .qa-field .textarea { font-size: 16px; }
    }
  `],
})
export class InboxActionsComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private realtime = inject(ConversationsRealtimeService);
  private destroyRef = inject(DestroyRef);

  conv = input.required<ActionConv>();
  /** Borrador del compositor: es lo que se propone programar. */
  draft = input('');
  subject = input('');
  attachment = input<ActionAttachment | null>(null);
  /** Se programó el borrador: el compositor debe vaciarse. */
  scheduledDraft = output<void>();

  readonly CalendarPlus = CalendarPlus;
  readonly PhoneCall = PhoneCall;
  readonly CalendarClock = CalendarClock;
  readonly ListTodo = ListTodo;
  readonly ListChecks = ListChecks;
  readonly X = X;
  readonly Video = Video;
  readonly Clock = Clock;
  readonly Check = Check;
  readonly Trash2 = Trash2;
  readonly AlertCircle = AlertCircle;

  readonly durations = [15, 30, 45, 60, 90];

  modal = signal<ActionKind | null>(null);
  saving = signal(false);
  tasks = signal<ConvTask[]>([]);
  scheduled = signal<Scheduled[]>([]);
  connections = signal<CalendarConnection[]>([]);
  loadingConnections = signal(false);
  private connectionsLoaded = false;

  isEmail = computed(() => this.conv().channel === 'email');
  pendingCount = computed(() => this.tasks().length + this.scheduled().length);
  overdueCount = computed(() =>
    this.tasks().filter(t => this.isLate(t.dueAt)).length + this.scheduled().filter(s => s.status === 'failed').length,
  );

  // Formulario (uno a la vez; se reinicia al abrir).
  when = '';
  notes = '';
  callTitle = '';
  duration = 30;
  connectionId = '';
  attendee = '';
  sendLink = true;
  taskTitle = '';
  remindWa = false;
  schedText = '';
  schedSubject = '';

  constructor() {
    // Al cambiar de chat se recargan sus pendientes.
    effect(() => {
      const id = this.conv()._id;
      untracked(() => {
        this.modal.set(null);
        this.tasks.set([]);
        this.scheduled.set([]);
        this.loadPending(id);
      });
    });
    this.realtime.scheduledChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(p => {
      if (p.conversationId === this.conv()._id) this.loadPending(p.conversationId);
    });
  }

  private name(): string {
    const c = this.conv();
    return c.contactName?.trim() || (c.channel === 'whatsapp' ? `+${c.contact}` : c.contact);
  }

  /** Abre un acceso directo; también lo usa la hoja de acciones del móvil. */
  open(kind: ActionKind) {
    this.notes = '';
    this.remindWa = false;
    const name = this.name();
    if (kind === 'call') {
      this.when = toLocalInput(this.presets()[0].at);
      this.callTitle = `Llamada con ${name}`;
      this.duration = 30;
      this.attendee = this.isEmail() ? this.conv().contact : '';
      this.sendLink = true;
      this.loadConnections();
    } else if (kind === 'callback' || kind === 'task') {
      this.when = toLocalInput(this.presets()[0].at);
      this.taskTitle = kind === 'callback' ? `Volver a llamar a ${name}` : '';
    } else if (kind === 'schedule') {
      this.when = toLocalInput(at(1, 9));
      this.schedText = this.draft();
      this.schedSubject = this.subject();
    } else if (kind === 'pending') {
      this.loadPending(this.conv()._id);
    }
    this.modal.set(kind);
  }

  close() { this.modal.set(null); }

  title(kind: ActionKind): string {
    switch (kind) {
      case 'call': return 'Agendar llamada';
      case 'callback': return 'Volver a llamar';
      case 'schedule': return this.isEmail() ? 'Programar correo' : 'Programar mensaje';
      case 'pending': return 'Pendientes del chat';
      default: return 'Nueva tarea';
    }
  }

  submitLabel(kind: ActionKind): string {
    if (kind === 'call') return this.connectionId ? 'Agendar y crear enlace' : 'Agendar';
    if (kind === 'schedule') return 'Programar envío';
    return 'Crear recordatorio';
  }

  /** Atajos de fecha: lo que se elige el 90% de las veces sin abrir el calendario. */
  presets(): Preset[] {
    const now = new Date();
    const inHour = new Date(now.getTime() + 60 * 60_000);
    inHour.setMinutes(inHour.getMinutes() < 30 ? 30 : 60, 0, 0);
    const list: Preset[] = [{ label: 'En 1 hora', at: inHour }];
    if (now.getHours() < 15) list.push({ label: 'Hoy 16:00', at: at(0, 16) });
    list.push({ label: 'Mañana 9:00', at: at(1, 9) });
    list.push({ label: 'Mañana 16:00', at: at(1, 16) });
    list.push({ label: 'En 3 días', at: at(3, 9) });
    const toMonday = ((8 - now.getDay()) % 7) || 7;
    list.push({ label: 'Próximo lunes', at: at(toMonday, 9) });
    return list;
  }

  toInput(d: Date) { return toLocalInput(d); }
  minWhen() { return toLocalInput(new Date()); }

  isLate(iso?: string) { return !!iso && new Date(iso).getTime() < Date.now(); }

  fmt(iso?: string) {
    if (!iso) return 'Sin fecha';
    return new Date(iso).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  private loadPending(id: string) {
    const ctx = { context: silentRequest() };
    this.http.get<ConvTask[]>(`${API}/conversations/${id}/tasks`, ctx).subscribe({
      next: list => { if (id === this.conv()._id) this.tasks.set(list); },
      error: () => {},
    });
    this.http.get<Scheduled[]>(`${API}/conversations/${id}/scheduled`, ctx).subscribe({
      next: list => { if (id === this.conv()._id) this.scheduled.set(list); },
      error: () => {},
    });
  }

  private loadConnections() {
    if (this.connectionsLoaded) {
      this.connectionId = this.connections().find(c => c.isDefault)?._id ?? '';
      return;
    }
    this.loadingConnections.set(true);
    this.http.get<{ connections: CalendarConnection[] }>(`${API}/calendar/connections`, { context: silentRequest() }).subscribe({
      next: r => {
        this.connectionsLoaded = true;
        this.connections.set(r.connections ?? []);
        this.connectionId = this.connections().find(c => c.isDefault)?._id ?? '';
        this.loadingConnections.set(false);
      },
      error: () => { this.connections.set([]); this.loadingConnections.set(false); },
    });
  }

  private whenDate(): Date | null {
    const d = this.when ? new Date(this.when) : null;
    if (!d || Number.isNaN(d.getTime())) { this.toast.error('Elige la fecha y la hora'); return null; }
    if (d.getTime() < Date.now() - 60_000) { this.toast.error('La fecha ya pasó'); return null; }
    return d;
  }

  async submit(kind: ActionKind) {
    const due = this.whenDate();
    if (!due) return;
    this.saving.set(true);
    try {
      if (kind === 'call') await this.submitCall(due);
      else if (kind === 'schedule') await this.submitSchedule(due);
      else await this.submitTask(due);
      this.close();
      this.loadPending(this.conv()._id);
    } catch (err: unknown) {
      const e = err as { error?: { message?: string | string[] } };
      const msg = Array.isArray(e.error?.message) ? e.error?.message[0] : e.error?.message;
      this.toast.error(msg || 'No se pudo guardar');
    } finally {
      this.saving.set(false);
    }
  }

  private async submitCall(start: Date) {
    const title = this.callTitle.trim() || `Llamada con ${this.name()}`;
    const id = this.conv()._id;
    let link = '';
    let provider = '';
    if (this.connectionId) {
      const ev = await firstValueFrom(this.http.post<CalendarEvent>(`${API}/calendar/events`, {
        title,
        description: this.notes.trim() || undefined,
        start: start.toISOString(),
        durationMinutes: this.duration,
        attendees: this.attendee.trim() ? [this.attendee.trim()] : undefined,
        connectionId: this.connectionId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }));
      link = ev.joinUrl || ev.htmlLink || '';
      provider = ev.provider === 'google' ? 'Google Meet' : 'Microsoft Teams';
    }
    const body = [this.notes.trim(), link ? `Enlace (${provider}): ${link}` : ''].filter(Boolean).join('\n\n');
    await firstValueFrom(this.http.post(`${API}/conversations/${id}/tasks`, {
      type: link ? 'meeting' : 'call',
      title,
      body: body || undefined,
      dueAt: start.toISOString(),
    }));
    if (link && this.sendLink) {
      const cuando = start.toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      await firstValueFrom(this.http.post(`${API}/conversations/${id}/messages`, {
        text: `Te agendé una videollamada para el ${cuando} (${this.duration} min).\nEnlace para unirte: ${link}`,
        type: 'text',
        pauseAgent: false,
        ...(this.isEmail() ? { subject: `Invitación: ${title}` } : {}),
      }));
    }
    this.toast.success(link ? `Llamada agendada con enlace de ${provider}` : 'Llamada agendada');
  }

  private async submitTask(due: Date) {
    const title = this.taskTitle.trim();
    if (!title) throw { error: { message: 'Escribe qué hay que hacer' } };
    await firstValueFrom(this.http.post(`${API}/conversations/${this.conv()._id}/tasks`, {
      type: this.modal() === 'callback' ? 'call' : 'task',
      title,
      body: this.notes.trim() || undefined,
      dueAt: due.toISOString(),
      remindByWhatsApp: this.remindWa,
    }));
    this.toast.success('Recordatorio creado');
  }

  private async submitSchedule(sendAt: Date) {
    const text = this.schedText.trim();
    const att = this.attachment();
    if (!text && !att) throw { error: { message: 'El mensaje está vacío' } };
    await firstValueFrom(this.http.post(`${API}/conversations/${this.conv()._id}/scheduled`, {
      text,
      sendAt: sendAt.toISOString(),
      ...(att ? { type: att.type, mediaUrl: att.url, mediaKey: att.key, mimeType: att.mimeType, filename: att.filename, size: att.size } : { type: 'text' }),
      ...(this.isEmail() && this.schedSubject.trim() ? { subject: this.schedSubject.trim() } : {}),
    }));
    this.toast.success(`Se enviará el ${this.fmt(sendAt.toISOString())}`);
    // Lo programado sale del compositor, como si se hubiera enviado.
    if (text === this.draft().trim() || att) this.scheduledDraft.emit();
  }

  completeTask(t: ConvTask) {
    this.http.patch(`${API}/conversations/${this.conv()._id}/tasks/${t.leadId}/${t._id}`, { done: true }).subscribe({
      next: () => {
        this.tasks.update(list => list.filter(x => x._id !== t._id));
        this.toast.success('Tarea completada');
      },
      error: err => this.toast.error(err.error?.message || 'No se pudo completar la tarea'),
    });
  }

  async cancelScheduled(s: Scheduled) {
    const ok = await this.confirm.confirm({
      title: 'Cancelar envío',
      message: 'El mensaje programado no se enviará.',
      confirmText: 'Cancelar envío',
      danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/conversations/${this.conv()._id}/scheduled/${s._id}`).subscribe({
      next: () => {
        this.scheduled.update(list => list.filter(x => x._id !== s._id));
        this.toast.success('Envío cancelado');
      },
      error: err => this.toast.error(err.error?.message || 'No se pudo cancelar'),
    });
  }
}
