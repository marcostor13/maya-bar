import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, switchMap } from 'rxjs';
import {
  LucideAngularModule, Plus, Pencil, Trash2, X, MessageSquare, MessageCircle, Mail,
  Copy, TriangleAlert, FileText, LayoutTemplate,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { PermissionsService } from '../../auth/permissions.service';
import {
  MessageChannel, MessagePreview, MessageTemplate, TemplateVariable, TemplatesApiService,
} from '../../core/api/templates-api.service';
import { VariableChipsComponent, insertAtCursor } from './variable-chips';

type ErrorLike = { error?: { message?: string } };

const CHANNELS: { key: MessageChannel; label: string }[] = [
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email (texto)' },
];

/** Plantillas de texto con variables para SMS, WhatsApp y email. */
@Component({
  selector: 'app-message-templates',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe, RouterLink, VariableChipsComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Plantillas de mensaje</h1>
          <p class="page-sub">
            Textos reutilizables con variables para SMS, WhatsApp y correo. Cada variable se
            sustituye por el dato de cada contacto al enviar.
          </p>
        </div>
        <div class="header-actions">
          <a class="btn btn-secondary" routerLink="/plantillas-email">
            <lucide-icon [img]="LayoutTemplate" [size]="16"></lucide-icon>
            Plantillas de email
          </a>
          @if (canCreate()) {
            <button class="btn btn-primary" (click)="open(null)">
              <lucide-icon [img]="Plus" [size]="17" [strokeWidth]="2.5"></lucide-icon>
              Nueva plantilla
            </button>
          }
        </div>
      </div>

      <div class="chips" role="tablist" aria-label="Canal">
        <button class="chip" [class.active]="filter() === ''" (click)="filter.set('')">Todas ({{ templates().length }})</button>
        @for (c of channels; track c.key) {
          <button class="chip" [class.active]="filter() === c.key" (click)="filter.set(c.key)">
            {{ c.label }} ({{ count(c.key) }})
          </button>
        }
      </div>

      @if (loading()) {
        <div class="grid">
          @for (i of [1, 2, 3]; track i) { <div class="card skeleton"></div> }
        </div>
      } @else if (!visible().length) {
        <div class="card empty">
          <lucide-icon [img]="FileText" [size]="40" [strokeWidth]="1.5"></lucide-icon>
          <h3>Aún no hay plantillas</h3>
          <p>Crea la primera y reutilízala en tus campañas de SMS, WhatsApp o correo.</p>
          @if (canCreate()) {
            <button class="btn btn-primary" (click)="open(null)">
              <lucide-icon [img]="Plus" [size]="16"></lucide-icon> Crear plantilla
            </button>
          }
        </div>
      } @else {
        <div class="grid">
          @for (t of visible(); track t._id) {
            <article class="card tpl">
              <div class="tpl-head">
                <span class="badge" [class]="'badge ' + badge(t.channel)">
                  <lucide-icon [img]="icon(t.channel)" [size]="12"></lucide-icon>
                  {{ channelLabel(t.channel) }}
                </span>
                <span class="tpl-date">{{ t.updatedAt | date: 'dd/MM/yyyy' }}</span>
              </div>
              <h3 class="tpl-name">{{ t.name }}</h3>
              @if (t.subject) { <p class="tpl-subject">{{ t.subject }}</p> }
              <p class="tpl-body">{{ t.body }}</p>
              <div class="tpl-actions">
                <button class="btn btn-ghost btn-sm" (click)="copy(t)">
                  <lucide-icon [img]="Copy" [size]="14"></lucide-icon> Copiar
                </button>
                <span class="spacer"></span>
                @if (canEdit()) {
                  <button class="btn btn-ghost btn-sm btn-icon" (click)="open(t)" aria-label="Editar plantilla">
                    <lucide-icon [img]="Pencil" [size]="15"></lucide-icon>
                  </button>
                }
                @if (canDelete()) {
                  <button class="btn btn-ghost btn-sm btn-icon" (click)="remove(t)" aria-label="Eliminar plantilla">
                    <lucide-icon [img]="Trash2" [size]="15"></lucide-icon>
                  </button>
                }
              </div>
            </article>
          }
        </div>
      }
    </div>

    @if (drawerOpen()) {
      <div class="overlay" (click)="close()" role="dialog" aria-modal="true" aria-label="Editar plantilla">
        <aside class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <h2>{{ editingId() ? 'Editar plantilla' : 'Nueva plantilla' }}</h2>
            <button class="btn btn-ghost btn-icon" (click)="close()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20"></lucide-icon>
            </button>
          </div>

          <div class="drawer-body">
            <label class="field">
              <span class="label">Nombre</span>
              <input class="input" #nameInput [(ngModel)]="name" maxlength="80"
                placeholder="Ej. Recordatorio de cita" />
            </label>

            <div class="field">
              <span class="label">Canal</span>
              <div class="chips">
                @for (c of channels; track c.key) {
                  <button type="button" class="chip" [class.active]="channel() === c.key" (click)="setChannel(c.key)">
                    <lucide-icon [img]="icon(c.key)" [size]="13"></lucide-icon> {{ c.label }}
                  </button>
                }
              </div>
            </div>

            @if (channel() === 'email') {
              <label class="field">
                <span class="label">Asunto</span>
                <input class="input" #subjectInput [(ngModel)]="subject" (ngModelChange)="refresh()"
                  (focus)="target = subjectInput" maxlength="200" placeholder="Asunto del correo" />
              </label>
            }

            <div class="field">
              <span class="label">Mensaje</span>
              <app-variable-chips [variables]="variables()" (pick)="insert($event, bodyInput)" />
              <textarea class="textarea" #bodyInput rows="7" [(ngModel)]="body" (ngModelChange)="refresh()"
                (focus)="target = bodyInput" maxlength="5000"
                placeholder="Hola {primer_nombre}, …"></textarea>
              @if (channel() === 'sms' && preview(); as p) {
                <div class="counter" [class.warn]="p.sms.segments > 1">
                  <span>{{ p.sms.length }} caracteres · {{ p.sms.segments }} SMS · {{ p.sms.encoding }}</span>
                  <span>{{ p.sms.perSegment }} por segmento</span>
                </div>
                @if (p.sms.encoding === 'UCS-2') {
                  <p class="hint warn">
                    <lucide-icon [img]="TriangleAlert" [size]="13"></lucide-icon>
                    Estos caracteres reducen cada SMS a 70: {{ p.sms.unicodeChars.join(' ') }}
                  </p>
                }
              }
            </div>

            @if (preview(); as p) {
              @if (p.unknown.length) {
                <p class="hint warn">
                  <lucide-icon [img]="TriangleAlert" [size]="13"></lucide-icon>
                  Variables que no existen y se enviarán tal cual: {{ p.unknown.join(', ') }}
                </p>
              }
              <div class="field">
                <span class="label">Así lo verá el contacto</span>
                <div class="bubble-wrap">
                  @if (p.subject) { <p class="bubble-subject">{{ p.subject }}</p> }
                  <div class="bubble">{{ p.body || '…' }}</div>
                </div>
              </div>
            }
          </div>

          <div class="drawer-footer">
            <button class="btn btn-ghost" (click)="close()">Cancelar</button>
            <button class="btn btn-primary" (click)="save()" [disabled]="saving() || !name.trim() || !body.trim()">
              {{ saving() ? 'Guardando…' : 'Guardar plantilla' }}
            </button>
          </div>
        </aside>
      </div>
    }
  `,
  styles: [`
    .page { width:100%; box-sizing:border-box; padding:32px 40px; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; margin-bottom:24px; flex-wrap:wrap; }
    h1 { font-family:var(--font-heading); margin:0 0 6px; }
    .page-sub { color:var(--color-text-muted); margin:0; max-width:640px; }
    .header-actions { display:flex; gap:10px; flex-wrap:wrap; }
    .chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px; }
    .chip { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; font-family:var(--font-base); font-size:13px;
      font-weight:500; border-radius:var(--radius-pill); border:1px solid var(--color-border); background:var(--color-white);
      color:var(--color-text-muted); cursor:pointer; transition:all var(--transition-fast); }
    .chip.active { background:var(--color-brand); border-color:var(--color-brand); color:var(--color-white); }
    .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:20px; }
    .skeleton { height:180px; background:var(--color-bg-light); }
    .tpl { display:flex; flex-direction:column; gap:8px; padding:24px; }
    .tpl-head { display:flex; justify-content:space-between; align-items:center; }
    .tpl-date { font-size:12px; color:var(--color-text-muted); }
    .tpl-name { margin:4px 0 0; font-size:16px; font-family:var(--font-heading); }
    .tpl-subject { margin:0; font-size:13px; font-weight:600; color:var(--color-text-main); }
    .tpl-body { margin:0; font-size:13px; color:var(--color-text-muted); white-space:pre-wrap; overflow-wrap:anywhere;
      display:-webkit-box; -webkit-line-clamp:5; -webkit-box-orient:vertical; overflow:hidden; flex:1; }
    .tpl-actions { display:flex; align-items:center; gap:4px; margin-top:8px; }
    .spacer { flex:1; }
    .empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; padding:56px 24px; color:var(--color-text-muted); }
    .empty h3 { margin:8px 0 0; color:var(--color-text-main); font-family:var(--font-heading); }
    .empty p { margin:0 0 12px; max-width:380px; }

    .overlay { position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px); display:flex;
      justify-content:flex-end; z-index:100; }
    .drawer { width:100%; max-width:560px; height:100%; background:var(--color-white); display:flex; flex-direction:column;
      box-shadow:var(--shadow-lg); animation:slide-in .35s var(--transition-spring); }
    @keyframes slide-in { from { transform:translateX(40px); opacity:0; } to { transform:none; opacity:1; } }
    .drawer-header { display:flex; align-items:center; justify-content:space-between; padding:24px 28px 16px; }
    .drawer-header h2 { margin:0; font-family:var(--font-heading); font-size:20px; }
    .drawer-body { flex:1; overflow-y:auto; padding:8px 28px 24px; display:flex; flex-direction:column; gap:18px; }
    .drawer-footer { display:flex; justify-content:flex-end; gap:10px; padding:16px 28px; border-top:1px solid var(--color-border); }
    .field { display:flex; flex-direction:column; gap:8px; }
    .field .chips { margin-bottom:0; }
    .label { font-size:13px; font-weight:600; color:var(--color-text-main); }
    .counter { display:flex; justify-content:space-between; font-size:12px; color:var(--color-text-muted); }
    .counter.warn { color:var(--color-warning); }
    .hint { display:flex; align-items:center; gap:6px; margin:0; font-size:12px; color:var(--color-text-muted); }
    .hint.warn { color:var(--color-warning); }
    .bubble-wrap { background:var(--color-bg-app); border-radius:var(--radius-md); padding:16px; }
    .bubble-subject { margin:0 0 8px; font-weight:600; font-size:13px; }
    .bubble { background:var(--color-white); border-radius:var(--radius-md); padding:12px 14px; font-size:14px;
      white-space:pre-wrap; overflow-wrap:anywhere; box-shadow:var(--shadow-sm); max-width:92%; }

    @media (max-width: 768px) {
      .page { padding:20px 16px; }
      .drawer { max-width:100%; }
    }
  `],
})
export class MessageTemplatesComponent implements OnInit, OnDestroy {
  private api = inject(TemplatesApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private permissions = inject(PermissionsService);

  readonly Plus = Plus; readonly Pencil = Pencil; readonly Trash2 = Trash2; readonly X = X;
  readonly Copy = Copy; readonly TriangleAlert = TriangleAlert; readonly FileText = FileText;
  readonly LayoutTemplate = LayoutTemplate;
  readonly channels = CHANNELS;

  templates = signal<MessageTemplate[]>([]);
  variables = signal<TemplateVariable[]>([]);
  loading = signal(true);
  filter = signal<MessageChannel | ''>('');
  drawerOpen = signal(false);
  editingId = signal<string | null>(null);
  saving = signal(false);
  channel = signal<MessageChannel>('sms');
  preview = signal<MessagePreview | null>(null);

  name = '';
  subject = '';
  body = '';
  /** Campo que recibe la variable al pulsar un chip: el último enfocado. */
  target: HTMLTextAreaElement | HTMLInputElement | null = null;

  visible = computed(() => {
    const f = this.filter();
    return f ? this.templates().filter(t => t.channel === f) : this.templates();
  });

  canCreate = computed(() => this.permissions.canAct('campaigns', 'create'));
  canEdit = computed(() => this.permissions.canAct('campaigns', 'edit'));
  canDelete = computed(() => this.permissions.canAct('campaigns', 'delete'));

  private refresh$ = new Subject<void>();
  private sub?: Subscription;

  ngOnInit() {
    this.load();
    this.api.variables().subscribe({ next: v => this.variables.set(v), error: () => {} });
    this.sub = this.refresh$
      .pipe(
        debounceTime(300),
        switchMap(() => this.api.previewMessage(this.body, this.channel() === 'email' ? this.subject : undefined)),
      )
      .subscribe({ next: p => this.preview.set(p), error: () => {} });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  @HostListener('document:keydown.escape')
  onEscape() { if (this.drawerOpen()) this.close(); }

  private load() {
    this.loading.set(true);
    this.api.messageTemplates().subscribe({
      next: t => { this.templates.set(t); this.loading.set(false); },
      error: (err: ErrorLike) => {
        this.loading.set(false);
        this.toast.error(err.error?.message || 'No se pudieron cargar las plantillas');
      },
    });
  }

  count(channel: MessageChannel) { return this.templates().filter(t => t.channel === channel).length; }
  channelLabel(channel: MessageChannel) { return CHANNELS.find(c => c.key === channel)?.label ?? channel; }
  icon(channel: MessageChannel) { return channel === 'sms' ? MessageSquare : channel === 'whatsapp' ? MessageCircle : Mail; }
  badge(channel: MessageChannel) { return channel === 'sms' ? 'badge-info' : channel === 'whatsapp' ? 'badge-success' : 'badge-warning'; }

  open(t: MessageTemplate | null) {
    this.editingId.set(t?._id ?? null);
    this.name = t?.name ?? '';
    this.subject = t?.subject ?? '';
    this.body = t?.body ?? '';
    this.channel.set(t?.channel ?? (this.filter() || 'sms'));
    this.preview.set(null);
    this.target = null;
    this.drawerOpen.set(true);
    this.refresh();
    setTimeout(() => document.querySelector<HTMLInputElement>('.drawer .input')?.focus());
  }

  close() { this.drawerOpen.set(false); }

  setChannel(channel: MessageChannel) {
    this.channel.set(channel);
    this.refresh();
  }

  refresh() { this.refresh$.next(); }

  insert(token: string, fallback: HTMLTextAreaElement) {
    const el = this.target ?? fallback;
    const value = insertAtCursor(el, token);
    if (el === fallback) this.body = value; else this.subject = value;
    this.refresh();
  }

  save() {
    const input = {
      name: this.name.trim(),
      channel: this.channel(),
      subject: this.channel() === 'email' ? this.subject.trim() : undefined,
      body: this.body,
    };
    const id = this.editingId();
    this.saving.set(true);
    (id ? this.api.updateMessageTemplate(id, input) : this.api.createMessageTemplate(input)).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(id ? 'Plantilla actualizada' : 'Plantilla creada');
        this.close();
        this.load();
      },
      error: (err: ErrorLike) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'No se pudo guardar la plantilla');
      },
    });
  }

  async remove(t: MessageTemplate) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar plantilla',
      message: 'Se eliminará "' + t.name + '". Las campañas ya enviadas no cambian.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.deleteMessageTemplate(t._id).subscribe({
      next: () => { this.toast.success('Plantilla eliminada'); this.load(); },
      error: (err: ErrorLike) => this.toast.error(err.error?.message || 'No se pudo eliminar'),
    });
  }

  copy(t: MessageTemplate) {
    navigator.clipboard.writeText(t.body).then(
      () => this.toast.success('Texto copiado'),
      () => this.toast.error('No se pudo copiar'),
    );
  }
}
