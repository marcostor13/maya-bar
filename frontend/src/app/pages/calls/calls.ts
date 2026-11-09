import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  LucideAngularModule, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, ContactRound, MessagesSquare,
  ChevronLeft, ChevronRight, RefreshCw,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { CallsService } from '../../shared/calls/calls.service';
import { ConversationsRealtimeService } from '../../shared/conversations-realtime';
import {
  CallOptions, CallStatus, CallView, STATUS_LABELS, displayContact, formatDuration,
} from '../../shared/calls/calls.models';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/calls`;

interface CallPage {
  items: CallView[];
  total: number;
  page: number;
  pages: number;
}

const STATUS_BADGE: Record<CallStatus, string> = {
  ringing: 'badge-info',
  connecting: 'badge-info',
  active: 'badge-info',
  completed: 'badge-success',
  missed: 'badge-danger',
  rejected: 'badge-warning',
  blocked: 'badge-neutral',
  failed: 'badge-danger',
};

/** Fecha local "yyyy-mm-dd" → ISO del inicio o del final de ese día. */
export function dayBound(day: string, end: boolean): string | undefined {
  if (!day) return undefined;
  const [y, m, d] = day.split('-').map(Number);
  const date = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d);
  return date.toISOString();
}

@Component({
  selector: 'app-calls-page',
  standalone: true,
  imports: [FormsModule, DatePipe, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Llamadas</h1>
          <p class="page-sub">
            Llamadas de WhatsApp entrantes y salientes de todas las cuentas conectadas.
            Las entrantes suenan aquí mismo mientras tengas Maya abierto.
          </p>
        </div>
        <button class="btn btn-secondary" (click)="load()" [disabled]="loading()" aria-label="Actualizar">
          <lucide-icon [img]="RefreshCw" [size]="16" [strokeWidth]="2.4" /> Actualizar
        </button>
      </div>

      <div class="filters card" role="search" aria-label="Filtrar llamadas">
        <label class="f">
          <span>Desde</span>
          <input class="input" type="date" name="from" [(ngModel)]="from" (ngModelChange)="apply()" />
        </label>
        <label class="f">
          <span>Hasta</span>
          <input class="input" type="date" name="to" [(ngModel)]="to" (ngModelChange)="apply()" />
        </label>
        <label class="f">
          <span>Estado</span>
          <select class="select" name="status" [(ngModel)]="status" (ngModelChange)="apply()">
            <option value="">Todos</option>
            @for (s of statuses; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }
          </select>
        </label>
        <label class="f">
          <span>Tipo</span>
          <select class="select" name="direction" [(ngModel)]="direction" (ngModelChange)="apply()">
            <option value="">Todas</option>
            <option value="inbound">Entrantes</option>
            <option value="outbound">Salientes</option>
          </select>
        </label>
        <label class="f">
          <span>Atendió</span>
          <select class="select" name="user" [(ngModel)]="userId" (ngModelChange)="apply()">
            <option value="">Cualquiera</option>
            @for (u of options()?.users ?? []; track u._id) { <option [value]="u._id">{{ u.name }}</option> }
          </select>
        </label>
        @if ((options()?.accounts?.length ?? 0) > 1) {
          <label class="f">
            <span>Cuenta</span>
            <select class="select" name="account" [(ngModel)]="accountId" (ngModelChange)="apply()">
              <option value="">Todas</option>
              @for (a of options()!.accounts; track a._id) { <option [value]="a._id">{{ a.label }}</option> }
            </select>
          </label>
        }
      </div>

      @if (loading() && !data()) {
        <div class="empty-state card" aria-busy="true">Cargando llamadas…</div>
      } @else if (error()) {
        <div class="empty-state card" role="alert">
          <p>No se pudo cargar el historial.</p>
          <span>{{ error() }}</span>
          <button class="btn btn-primary btn-sm" (click)="load()">Reintentar</button>
        </div>
      } @else if (!data()?.items?.length) {
        <div class="empty-state card">
          <lucide-icon [img]="Phone" [size]="38" [strokeWidth]="1.5" />
          <p>{{ filtered() ? 'Ninguna llamada coincide con los filtros.' : 'Todavía no hay llamadas.' }}</p>
          <span>
            {{ filtered()
              ? 'Prueba con otras fechas o quita algún filtro.'
              : 'Cuando un cliente te llame por WhatsApp, o lo llames tú, aparecerá aquí.' }}
          </span>
        </div>
      } @else {
        <div class="table-wrap table-cards card">
          <table>
            <thead>
              <tr>
                <th>Contacto</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Duración</th>
                <th>Atendió</th>
                <th><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (c of data()!.items; track c._id) {
                <tr>
                  <td>
                    <div class="who">
                      <lucide-icon class="dir" [class.missed]="c.status === 'missed'"
                        [img]="c.status === 'missed' ? PhoneMissed : c.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing"
                        [size]="16" [attr.aria-label]="c.direction === 'inbound' ? 'Entrante' : 'Saliente'" />
                      <div>
                        <span class="who-name">{{ show(c) }}</span>
                        @if (c.contactName) { <span class="who-contact">{{ number(c) }}</span> }
                        @if (c.accountLabel && (options()?.accounts?.length ?? 0) > 1) {
                          <span class="who-contact">{{ c.accountLabel }}</span>
                        }
                      </div>
                    </div>
                  </td>
                  <td data-label="Fecha" class="td-muted">{{ c.startedAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td data-label="Estado"><span class="badge" [class]="'badge ' + badge(c.status)">{{ statusLabel(c.status) }}</span></td>
                  <td data-label="Duración">{{ duration(c.durationSec) }}</td>
                  <td data-label="Atendió" class="td-muted">{{ c.answeredByName || '—' }}</td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-primary" (click)="callBack(c)" [attr.aria-label]="'Devolver llamada a ' + show(c)">
                      <lucide-icon [img]="Phone" [size]="14" [strokeWidth]="2.4" /> Llamar
                    </button>
                    @if (c.customerId) {
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="openCustomer(c)" aria-label="Ver ficha del contacto" title="Ficha">
                        <lucide-icon [img]="ContactRound" [size]="15" />
                      </button>
                    }
                    @if (c.conversationId) {
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="openChat(c)" aria-label="Abrir conversación" title="Chat">
                        <lucide-icon [img]="MessagesSquare" [size]="15" />
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (data()!.pages > 1) {
          <nav class="pager" aria-label="Páginas">
            <button class="btn btn-sm btn-secondary" [disabled]="page() <= 1 || loading()" (click)="go(page() - 1)" aria-label="Página anterior">
              <lucide-icon [img]="ChevronLeft" [size]="15" />
            </button>
            <span>Página {{ data()!.page }} de {{ data()!.pages }} · {{ data()!.total }} llamadas</span>
            <button class="btn btn-sm btn-secondary" [disabled]="page() >= data()!.pages || loading()" (click)="go(page() + 1)" aria-label="Página siguiente">
              <lucide-icon [img]="ChevronRight" [size]="15" />
            </button>
          </nav>
        }
      }
    </div>
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
    .page-header h1 { margin: 0 0 4px; font-family: var(--font-heading); font-size: 26px; }
    .page-sub { margin: 0; color: var(--color-text-muted); font-size: 13.5px; max-width: 640px; line-height: 1.55; }
    .page-header .btn { display: inline-flex; align-items: center; gap: 6px; }

    .filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px 14px;
      padding: 16px 18px; margin-bottom: 18px; }
    .filters:hover { transform: none; box-shadow: var(--shadow-sm); }
    .f { display: flex; flex-direction: column; gap: 5px; }
    .f > span { font-size: 12px; font-weight: 600; color: var(--color-text-muted); }

    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 24px;
      text-align: center; color: var(--color-text-muted); }
    .empty-state:hover { transform: none; box-shadow: var(--shadow-sm); }
    .empty-state p { margin: 0; font-size: 15px; font-weight: 600; color: var(--color-text-main); }
    .empty-state span { font-size: 13.5px; max-width: 420px; line-height: 1.55; }

    .table-wrap { padding: 0; overflow-x: auto; }
    .table-wrap:hover { transform: none; box-shadow: var(--shadow-sm); }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 13px 18px; text-align: left; font-size: 12px; font-weight: 700; color: var(--color-text-muted);
      text-transform: uppercase; letter-spacing: .05em; background: var(--color-bg-app); border-bottom: 1px solid var(--color-border); }
    td { padding: 14px 18px; border-bottom: 1px solid var(--color-border); font-size: 14px; }
    tr:last-child td { border-bottom: none; }
    .td-muted { color: var(--color-text-muted); }
    .who { display: flex; align-items: center; gap: 10px; }
    .who > div { display: flex; flex-direction: column; }
    .dir { color: var(--color-brand); flex-shrink: 0; }
    .dir.missed { color: var(--color-error); }
    .who-name { font-weight: 600; color: var(--color-text-main); }
    .who-contact { font-size: 12.5px; color: var(--color-text-muted); }
    .actions-cell { text-align: right; white-space: nowrap; }
    .actions-cell .btn { display: inline-flex; align-items: center; gap: 5px; margin-left: 6px; }
    .pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 18px;
      font-size: 13.5px; color: var(--color-text-muted); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .filters { grid-template-columns: 1fr 1fr; }
      .actions-cell { text-align: left; }
      .actions-cell .btn { margin: 0 6px 0 0; }
    }
  `],
})
export class CallsPageComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private router = inject(Router);
  private calls = inject(CallsService);
  private realtime = inject(ConversationsRealtimeService);
  private sub?: Subscription;

  readonly Phone = Phone;
  readonly PhoneIncoming = PhoneIncoming;
  readonly PhoneOutgoing = PhoneOutgoing;
  readonly PhoneMissed = PhoneMissed;
  readonly ContactRound = ContactRound;
  readonly MessagesSquare = MessagesSquare;
  readonly ChevronLeft = ChevronLeft;
  readonly ChevronRight = ChevronRight;
  readonly RefreshCw = RefreshCw;

  readonly statuses: CallStatus[] = ['completed', 'missed', 'rejected', 'blocked', 'failed'];

  data = signal<CallPage | null>(null);
  options = signal<CallOptions | null>(null);
  loading = signal(false);
  error = signal('');
  page = signal(1);

  from = '';
  to = '';
  status = '';
  direction = '';
  userId = '';
  accountId = '';

  async ngOnInit() {
    this.calls.loadOptions().then(
      (o) => this.options.set(o),
      () => this.toast.error('No se pudieron cargar los filtros'),
    );
    // Al terminar una llamada, el historial se actualiza solo.
    this.sub = this.realtime.call$.subscribe((e) => {
      if (e.event === 'call:ended') void this.load();
    });
    await this.load();
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  filtered(): boolean {
    return !!(this.from || this.to || this.status || this.direction || this.userId || this.accountId);
  }

  apply() {
    this.page.set(1);
    void this.load();
  }

  go(page: number) {
    this.page.set(page);
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    let params = new HttpParams().set('page', this.page());
    const set = (k: string, v?: string) => {
      if (v) params = params.set(k, v);
    };
    set('from', dayBound(this.from, false));
    set('to', dayBound(this.to, true));
    set('status', this.status);
    set('direction', this.direction);
    set('userId', this.userId);
    set('accountId', this.accountId);
    try {
      this.data.set(await firstValueFrom(this.http.get<CallPage>(API, { params })));
    } catch (err) {
      const msg = (err as { error?: { message?: string } })?.error?.message || 'Error al cargar las llamadas';
      this.error.set(msg);
      this.toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  callBack(c: CallView) {
    this.calls.open({ contact: c.contact, contactName: c.contactName, accountId: c.accountId });
  }

  openCustomer(c: CallView) {
    void this.router.navigate(['/customers'], { queryParams: { view: c.customerId } });
  }

  openChat(c: CallView) {
    void this.router.navigate(['/inbox'], { queryParams: { c: c.conversationId } });
  }

  show(c: CallView) {
    return displayContact(c);
  }

  number(c: CallView) {
    return /^\d+$/.test(c.contact) ? `+${c.contact}` : c.contact;
  }

  statusLabel(s: CallStatus) {
    return STATUS_LABELS[s] ?? s;
  }

  badge(s: CallStatus) {
    return STATUS_BADGE[s] ?? 'badge-neutral';
  }

  duration(sec?: number) {
    return formatDuration(sec);
  }
}
