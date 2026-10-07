import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  StickyNote,
  Phone,
  MessageCircle,
  Mail,
  MessageSquare,
  Users,
  MapPin,
  ListTodo,
  UserCheck,
  Info,
  Pencil,
  Trash2,
  X,
  Check,
  UserPlus,
  ArrowRightLeft,
  UserMinus,
  Target,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AuthService } from '../../auth/auth.service';
import {
  ContactActivityType,
  ContactCareApiService,
  ContactOwner,
  OwnerRef,
  TimelineItem,
} from '../../core/api/contact-care-api.service';

interface TypeMeta {
  key: ContactActivityType;
  label: string;
  /** Título por defecto: ahorra escribirlo en el caso más común. */
  title: string;
}

const TYPES: TypeMeta[] = [
  { key: 'note', label: 'Comentario', title: 'Comentario' },
  { key: 'call', label: 'Llamada', title: 'Llamada con el cliente' },
  { key: 'whatsapp', label: 'WhatsApp', title: 'Conversación por WhatsApp' },
  { key: 'email', label: 'Email', title: 'Correo enviado' },
  { key: 'sms', label: 'SMS', title: 'SMS enviado' },
  { key: 'meeting', label: 'Reunión', title: 'Reunión con el cliente' },
  { key: 'visit', label: 'Visita', title: 'Visita al cliente' },
  { key: 'task', label: 'Tarea', title: 'Tarea realizada' },
];

const SUPERVISORS = ['SUPERADMIN', 'TENANT_ADMIN', 'MANAGER'];

type ErrorLike = { error?: { message?: string } };

/** Convierte una fecha a lo que espera un input datetime-local. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  );
}

/**
 * Atención de un contacto: quién lo lleva y qué se ha hecho con él. Se usa en
 * la ficha del cliente y en el panel lateral de una conversación.
 */
@Component({
  selector: 'app-contact-care',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe],
  template: `
    <section class="care">
      <!-- Responsable -->
      <div class="owner-box">
        <div class="owner-main">
          <div class="owner-avatar" [class.empty]="!owner()">
            <lucide-icon [img]="owner() ? UserCheck : UserPlus" [size]="16"></lucide-icon>
          </div>
          <div class="owner-text">
            <span class="owner-label">Responsable</span>
            <span class="owner-name">{{ ownerName() }}</span>
          </div>
        </div>
        <div class="owner-actions">
          @if (!owner()) {
            <button class="btn btn-sm btn-primary" (click)="claim()" [disabled]="busy()">
              <lucide-icon [img]="UserPlus" [size]="14"></lucide-icon>
              Asignármelo
            </button>
          }
          @if (canTransfer()) {
            <button class="btn btn-sm btn-secondary" (click)="openTransfer()" [disabled]="busy()">
              <lucide-icon [img]="ArrowRightLeft" [size]="14"></lucide-icon>
              {{ owner() ? 'Derivar' : 'Asignar a…' }}
            </button>
          }
          @if (canRelease()) {
            <button class="btn btn-sm btn-ghost" (click)="release()" [disabled]="busy()">
              <lucide-icon [img]="UserMinus" [size]="14"></lucide-icon>
              Liberar
            </button>
          }
        </div>
      </div>

      @if (transferOpen()) {
        <div class="transfer-box animate-fade-in">
          <select class="select" [(ngModel)]="transferTo" aria-label="Nuevo responsable">
            <option value="">Elige a quién…</option>
            @for (o of candidates(); track o._id) {
              <option [value]="o._id">
                {{ o.name }}{{ o._id === meId() ? ' (yo)' : '' }} · {{ o.contacts }} contacto(s)
              </option>
            }
          </select>
          <input class="input" [(ngModel)]="transferNote" maxlength="500"
            placeholder="Motivo o contexto (opcional)" />
          <div class="row-end">
            <button class="btn btn-sm btn-ghost" (click)="transferOpen.set(false)">Cancelar</button>
            <button class="btn btn-sm btn-primary" (click)="transfer()" [disabled]="!transferTo || busy()">
              Confirmar
            </button>
          </div>
        </div>
      }

      <!-- Nuevo registro -->
      <div class="composer">
        <div class="type-chips" role="radiogroup" aria-label="Tipo de registro">
          @for (t of types; track t.key) {
            <button type="button" class="type-chip" role="radio"
              [class.active]="type() === t.key" [attr.aria-checked]="type() === t.key"
              (click)="pickType(t)">
              <lucide-icon [img]="iconFor(t.key)" [size]="13"></lucide-icon>
              {{ t.label }}
            </button>
          }
        </div>
        <input class="input" [(ngModel)]="title" maxlength="160" placeholder="Qué pasó (título)" />
        <textarea class="textarea" rows="3" [(ngModel)]="body" maxlength="4000"
          placeholder="Detalle: qué se habló, qué se acordó, próximo paso…"></textarea>
        <div class="composer-foot">
          <label class="when">
            <span>Cuándo</span>
            <input class="input" type="datetime-local" [(ngModel)]="at" />
          </label>
          <div class="row-end">
            @if (editingId()) {
              <button class="btn btn-sm btn-ghost" (click)="cancelEdit()">Cancelar</button>
            }
            <button class="btn btn-sm btn-primary" (click)="save()" [disabled]="saving() || !title.trim()">
              <lucide-icon [img]="Check" [size]="14"></lucide-icon>
              {{ editingId() ? 'Guardar cambios' : 'Registrar' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Línea de tiempo -->
      @if (loading()) {
        <p class="muted">Cargando historial…</p>
      } @else if (!items().length) {
        <p class="muted">Aún no hay registros. Lo que anotes aquí queda en el historial del contacto.</p>
      } @else {
        <ol class="timeline">
          @for (item of items(); track item.source + item._id) {
            <li class="tl-item" [class.auto]="isAuto(item)">
              <div class="tl-icon" [class.assign]="item.type === 'assignment'">
                <lucide-icon [img]="iconFor(item.type)" [size]="14"></lucide-icon>
              </div>
              <div class="tl-body">
                <div class="tl-head">
                  <span class="tl-title">{{ item.title }}</span>
                  @if (item.editable) {
                    <span class="tl-tools">
                      <button class="btn btn-ghost btn-icon btn-sm" (click)="edit(item)" aria-label="Editar registro">
                        <lucide-icon [img]="Pencil" [size]="13"></lucide-icon>
                      </button>
                      <button class="btn btn-ghost btn-icon btn-sm" (click)="remove(item)" aria-label="Eliminar registro">
                        <lucide-icon [img]="Trash2" [size]="13"></lucide-icon>
                      </button>
                    </span>
                  }
                </div>
                @if (item.body) { <p class="tl-text">{{ item.body }}</p> }
                <div class="tl-meta">
                  <span>{{ typeLabel(item.type) }}</span>
                  <span>{{ item.at | date: 'dd/MM/yyyy HH:mm' }}</span>
                  @if (item.createdBy) { <span>{{ item.createdBy.name }}</span> }
                  @if (item.source === 'lead') {
                    <span class="tl-lead">
                      <lucide-icon [img]="Target" [size]="11"></lucide-icon>
                      {{ item.leadTitle || 'Oportunidad' }}
                    </span>
                  }
                </div>
              </div>
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: [`
    .care { display:flex; flex-direction:column; gap:16px; }
    .muted { color:var(--color-text-muted); font-size:13px; margin:0; }
    .row-end { display:flex; gap:8px; justify-content:flex-end; align-items:center; }

    .owner-box { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
      padding:14px 16px; border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-bg-light); }
    .owner-main { display:flex; align-items:center; gap:12px; min-width:0; }
    .owner-avatar { width:36px; height:36px; border-radius:var(--radius-pill); display:grid; place-items:center;
      background:var(--color-brand-light); color:var(--color-brand); flex-shrink:0; }
    .owner-avatar.empty { background:var(--color-white); color:var(--color-text-muted); border:1px dashed var(--color-border); }
    .owner-text { display:flex; flex-direction:column; min-width:0; }
    .owner-label { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--color-text-muted); }
    .owner-name { font-weight:600; color:var(--color-text-main); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .owner-actions { display:flex; gap:8px; flex-wrap:wrap; }

    .transfer-box { display:flex; flex-direction:column; gap:10px; padding:14px 16px;
      border:1px solid var(--color-border); border-radius:var(--radius-md); }

    .composer { display:flex; flex-direction:column; gap:10px; }
    .type-chips { display:flex; gap:6px; flex-wrap:wrap; }
    .type-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; font-size:12px; font-weight:500;
      border-radius:var(--radius-pill); border:1px solid var(--color-border); background:var(--color-white);
      color:var(--color-text-muted); cursor:pointer; transition:all var(--transition-fast); font-family:var(--font-base); }
    .type-chip:hover { border-color:var(--color-brand); color:var(--color-brand); }
    .type-chip.active { background:var(--color-brand); border-color:var(--color-brand); color:var(--color-white); }
    .composer-foot { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .when { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--color-text-muted); }

    .timeline { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
    .tl-item { display:flex; gap:12px; padding:12px 0; border-top:1px solid var(--color-border); }
    .tl-item:first-child { border-top:none; }
    .tl-icon { width:30px; height:30px; border-radius:var(--radius-pill); display:grid; place-items:center; flex-shrink:0;
      background:var(--color-brand-light); color:var(--color-brand); }
    .tl-icon.assign { background:var(--color-bg-light); color:var(--color-text-muted); }
    .tl-body { flex:1; min-width:0; }
    .tl-head { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
    .tl-title { font-weight:600; font-size:14px; color:var(--color-text-main); overflow-wrap:anywhere; }
    .tl-item.auto .tl-title { font-weight:500; color:var(--color-text-muted); }
    .tl-tools { display:flex; gap:2px; flex-shrink:0; }
    .tl-text { margin:4px 0 0; font-size:13px; color:var(--color-text-main); white-space:pre-wrap; overflow-wrap:anywhere; }
    .tl-meta { display:flex; flex-wrap:wrap; gap:4px 12px; margin-top:6px; font-size:11px; color:var(--color-text-muted); }
    .tl-lead { display:inline-flex; align-items:center; gap:4px; color:var(--color-brand); }
  `],
})
export class ContactCareComponent {
  private api = inject(ContactCareApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private auth = inject(AuthService);

  /** Contacto atendido. Al cambiar se recarga todo. */
  customerId = input.required<string>();
  /** Responsable actual, tal como viene en el contacto. */
  ownerRef = input<OwnerRef | null | undefined>(null, { alias: 'owner' });
  /** Conversación desde la que se registra, si se usa en el inbox. */
  conversationId = input<string | undefined>(undefined);

  /** Avisa al padre del nuevo responsable (null = sin asignar). */
  ownerChanged = output<OwnerRef | null>();

  readonly UserCheck = UserCheck; readonly UserPlus = UserPlus;
  readonly ArrowRightLeft = ArrowRightLeft; readonly UserMinus = UserMinus;
  readonly Pencil = Pencil; readonly Trash2 = Trash2; readonly X = X;
  readonly Check = Check; readonly Target = Target;

  readonly types = TYPES;

  owner = signal<OwnerRef | null>(null);
  items = signal<TimelineItem[]>([]);
  loading = signal(false);
  saving = signal(false);
  busy = signal(false);
  owners = signal<ContactOwner[]>([]);
  transferOpen = signal(false);
  editingId = signal<string | null>(null);
  type = signal<ContactActivityType>('note');

  title = '';
  body = '';
  at = toLocalInput(new Date());
  transferTo = '';
  transferNote = '';

  meId = computed(() => this.auth.currentUser()?.id ?? '');
  private isSupervisor = computed(() => SUPERVISORS.includes(this.auth.currentUser()?.role ?? ''));
  private isMine = computed(() => !!this.owner() && this.owner()!._id === this.meId());

  ownerName = computed(() => {
    const o = this.owner();
    if (!o) return 'Sin asignar';
    return (o.name || o.email || 'Usuario') + (o._id === this.meId() ? ' (yo)' : '');
  });
  canTransfer = computed(() => this.isSupervisor() || this.isMine());
  canRelease = computed(() => !!this.owner() && (this.isSupervisor() || this.isMine()));
  candidates = computed(() => this.owners().filter(o => o._id !== this.owner()?._id));

  constructor() {
    effect(() => {
      const id = this.customerId();
      this.owner.set(this.ownerRef() ?? null);
      this.resetComposer();
      this.transferOpen.set(false);
      if (id) this.load(id);
    });
  }

  private load(id: string) {
    this.loading.set(true);
    this.api.timeline(id).subscribe({
      next: items => { this.items.set(items); this.loading.set(false); },
      error: (err: ErrorLike) => {
        this.loading.set(false);
        this.toast.error(err.error?.message || 'No se pudo cargar el historial');
      },
    });
  }

  // ── Responsable ──
  claim() {
    this.run(this.api.claim(this.customerId()), 'Contacto asignado a ti');
  }

  openTransfer() {
    this.transferTo = '';
    this.transferNote = '';
    this.transferOpen.set(true);
    if (!this.owners().length) {
      this.api.owners().subscribe({
        next: o => this.owners.set(o),
        error: (err: ErrorLike) => this.toast.error(err.error?.message || 'No se pudieron cargar los usuarios'),
      });
    }
  }

  transfer() {
    if (!this.transferTo) return;
    this.run(
      this.api.assign(this.customerId(), this.transferTo, this.transferNote.trim() || undefined),
      'Responsable actualizado',
    );
  }

  async release() {
    const ok = await this.confirm.confirm({
      title: 'Liberar contacto',
      message: 'El contacto quedará sin responsable y cualquier agente podrá tomarlo.',
      confirmText: 'Liberar',
    });
    if (!ok) return;
    this.run(this.api.release(this.customerId()), 'Contacto liberado');
  }

  private run(req: ReturnType<ContactCareApiService['claim']>, okMessage: string) {
    this.busy.set(true);
    req.subscribe({
      next: contact => {
        this.busy.set(false);
        this.transferOpen.set(false);
        const next = contact.ownerId ?? null;
        this.owner.set(next);
        this.ownerChanged.emit(next);
        this.toast.success(okMessage);
        this.load(this.customerId());
      },
      error: (err: ErrorLike) => {
        this.busy.set(false);
        this.toast.error(err.error?.message || 'No se pudo cambiar el responsable');
      },
    });
  }

  // ── Bitácora ──
  pickType(t: TypeMeta) {
    // Solo se pisa el título si sigue siendo el sugerido del tipo anterior.
    const previous = TYPES.find(x => x.key === this.type())?.title;
    if (!this.title.trim() || this.title === previous) this.title = t.title;
    this.type.set(t.key);
  }

  save() {
    const title = this.title.trim();
    if (!title) return;
    const payload = {
      type: this.type(),
      title,
      body: this.body.trim(),
      at: this.at ? new Date(this.at).toISOString() : undefined,
    };
    const editing = this.editingId();
    const req = editing
      ? this.api.updateActivity(this.customerId(), editing, payload)
      : this.api.addActivity(this.customerId(), {
          ...payload,
          body: payload.body || undefined,
          conversationId: this.conversationId(),
        });
    this.saving.set(true);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(editing ? 'Registro actualizado' : 'Registro guardado');
        this.resetComposer();
        this.load(this.customerId());
      },
      error: (err: ErrorLike) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'No se pudo guardar el registro');
      },
    });
  }

  edit(item: TimelineItem) {
    this.editingId.set(item._id);
    this.type.set(item.type as ContactActivityType);
    this.title = item.title;
    this.body = item.body ?? '';
    this.at = toLocalInput(new Date(item.at));
  }

  cancelEdit() { this.resetComposer(); }

  async remove(item: TimelineItem) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar registro',
      message: 'Se quitará del historial del contacto. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.deleteActivity(this.customerId(), item._id).subscribe({
      next: () => { this.toast.success('Registro eliminado'); this.load(this.customerId()); },
      error: (err: ErrorLike) => this.toast.error(err.error?.message || 'No se pudo eliminar'),
    });
  }

  private resetComposer() {
    this.editingId.set(null);
    this.type.set('note');
    this.title = TYPES[0].title;
    this.body = '';
    this.at = toLocalInput(new Date());
  }

  // ── Presentación ──
  isAuto(item: TimelineItem) {
    return ['assignment', 'system', 'stage_change'].includes(item.type);
  }

  typeLabel(type: string) {
    const known = TYPES.find(t => t.key === type)?.label;
    if (known) return known;
    if (type === 'assignment') return 'Asignación';
    if (type === 'stage_change') return 'Cambio de etapa';
    return 'Sistema';
  }

  iconFor(type: string) {
    switch (type) {
      case 'call': return Phone;
      case 'whatsapp': return MessageCircle;
      case 'email': return Mail;
      case 'sms': return MessageSquare;
      case 'meeting': return Users;
      case 'visit': return MapPin;
      case 'task': return ListTodo;
      case 'assignment': return UserCheck;
      case 'stage_change': return Target;
      case 'system': return Info;
      default: return StickyNote;
    }
  }
}
