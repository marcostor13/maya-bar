import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Building2, Users, MessageCircle, Instagram, Facebook, Mail, KeyRound,
  Power, Trash2, X, History, Contact, MessagesSquare, Send, UserCog, UserPlus, Copy,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { FormPageComponent, snapshotOf } from '../../shared/form-page';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export type Plan = 'starter' | 'pro' | 'enterprise';

export interface TenantRow {
  _id: string;
  name: string;
  slug: string;
  email: string;
  ruc?: string;
  phone?: string;
  plan: Plan;
  planExpiresAt?: string;
  trialEndsAt?: string;
  isActive: boolean;
  createdAt?: string;
}

export interface TenantUser {
  _id: string;
  name?: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  lastAccessAt?: string;
  createdAt?: string;
}

export interface TenantOverview {
  tenant: TenantRow;
  users: TenantUser[];
  /** Administrador activo más antiguo; `null` si la empresa no tiene (HU17). */
  owner?: TenantUser | null;
  usage: {
    contacts: number;
    conversations: number;
    messagesOut30d: number;
    accounts: { whatsapp: number; instagram: number; messenger: number; email: number; sms?: number };
    apiAccesses: number;
  };
}

export interface TenantAuditEntry {
  _id: string;
  action: 'create' | 'update' | 'suspend' | 'reactivate' | 'delete' | 'owner_reset' | 'owner_assign';
  actorEmail?: string;
  changes?: Record<string, { from?: unknown; to?: unknown }>;
  at: string;
}

interface TenantForm {
  name: string;
  email: string;
  ruc: string;
  phone: string;
  plan: Plan;
  planExpiresAt: string;
  trialEndsAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  TENANT_ADMIN: 'Administrador', MANAGER: 'Gerente', MARKETING: 'Marketing', SALES: 'Ventas', AGENT: 'Agente',
};
const ACTION_LABELS: Record<TenantAuditEntry['action'], string> = {
  create: 'Creó la empresa',
  update: 'Editó los datos',
  suspend: 'Suspendió la empresa',
  reactivate: 'Reactivó la empresa',
  delete: 'Eliminó la empresa',
  owner_reset: 'Restableció la cuenta principal',
  owner_assign: 'Nombró un administrador',
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** `2026-11-18T…` → `2026-11-18` para un `<input type="date">`. */
const dateOnly = (iso?: string) => (iso ? iso.slice(0, 10) : '');

/** Ficha de una empresa para el superadministrador (HU16). */
@Component({
  selector: 'app-tenant-detail',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe, FormPageComponent],
  template: `
    <form (ngSubmit)="save()">
      <app-form-page
        [title]="overview()?.tenant?.name || 'Empresa'"
        [subtitle]="overview() ? (overview()!.tenant.isActive ? 'Activa' : 'Suspendida') + ' · ' + overview()!.tenant.slug : ''"
        backLabel="Empresas"
        [urlKey]="'empresa-' + tenantId()"
        [dirty]="isDirty()"
        (closed)="closed.emit()">
        <ng-container formActions>
          @if (overview()) {
            <button class="btn btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
          }
        </ng-container>

        @if (loading()) {
          <div class="card state">Cargando…</div>
        } @else if (loadError()) {
          <div class="card state" role="alert">
            <p>No se pudo cargar la empresa.</p>
            <button class="btn btn-secondary btn-sm" type="button" (click)="load()">Reintentar</button>
          </div>
        } @else if (overview(); as o) {
          <div class="grid">
            <section class="card block" aria-labelledby="td-data">
              <h2 id="td-data"><lucide-icon [img]="Building2" [size]="18" [strokeWidth]="2.2"></lucide-icon> Datos</h2>
              <div class="field">
                <label class="label" for="td-name">Razón social</label>
                <input id="td-name" class="input" name="name" [(ngModel)]="form.name" required maxlength="120" />
              </div>
              <div class="field">
                <label class="label" for="td-email">Correo de la empresa</label>
                <input id="td-email" class="input" type="email" name="email" [(ngModel)]="form.email" required />
              </div>
              <div class="row">
                <div class="field">
                  <label class="label" for="td-ruc">RUC / NIF</label>
                  <input id="td-ruc" class="input" name="ruc" [(ngModel)]="form.ruc" />
                </div>
                <div class="field">
                  <label class="label" for="td-phone">Teléfono</label>
                  <input id="td-phone" class="input" name="phone" [(ngModel)]="form.phone" />
                </div>
              </div>
              <div class="row">
                <div class="field">
                  <label class="label" for="td-plan">Plan</label>
                  <select id="td-plan" class="select" name="plan" [(ngModel)]="form.plan">
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div class="field">
                  <label class="label" for="td-plan-exp">Vence el plan</label>
                  <input id="td-plan-exp" class="input" type="date" name="planExpiresAt" [(ngModel)]="form.planExpiresAt" />
                </div>
              </div>
              <div class="field">
                <label class="label" for="td-trial">Fin de la prueba</label>
                <input id="td-trial" class="input" type="date" name="trialEndsAt" [(ngModel)]="form.trialEndsAt" />
              </div>
            </section>

            <section class="card block" aria-labelledby="td-usage">
              <h2 id="td-usage"><lucide-icon [img]="MessagesSquare" [size]="18" [strokeWidth]="2.2"></lucide-icon> Uso</h2>
              <div class="stats">
                <div class="stat"><lucide-icon [img]="Contact" [size]="16"></lucide-icon><strong>{{ o.usage.contacts }}</strong><span>contactos</span></div>
                <div class="stat"><lucide-icon [img]="MessagesSquare" [size]="16"></lucide-icon><strong>{{ o.usage.conversations }}</strong><span>conversaciones</span></div>
                <div class="stat"><lucide-icon [img]="Send" [size]="16"></lucide-icon><strong>{{ o.usage.messagesOut30d }}</strong><span>enviados (30 días)</span></div>
                <div class="stat"><lucide-icon [img]="KeyRound" [size]="16"></lucide-icon><strong>{{ o.usage.apiAccesses }}</strong><span>accesos de API</span></div>
              </div>
              <h3 class="sub">Cuentas conectadas</h3>
              <ul class="accounts">
                <li><lucide-icon [img]="MessageCircle" [size]="15"></lucide-icon> WhatsApp <strong>{{ o.usage.accounts.whatsapp }}</strong></li>
                <li><lucide-icon [img]="Instagram" [size]="15"></lucide-icon> Instagram <strong>{{ o.usage.accounts.instagram }}</strong></li>
                <li><lucide-icon [img]="Facebook" [size]="15"></lucide-icon> Messenger <strong>{{ o.usage.accounts.messenger }}</strong></li>
                <li><lucide-icon [img]="Mail" [size]="15"></lucide-icon> Correo <strong>{{ o.usage.accounts.email }}</strong></li>
                <li><lucide-icon [img]="MessageCircle" [size]="15"></lucide-icon> SMS <strong>{{ o.usage.accounts.sms ?? 0 }}</strong></li>
              </ul>
            </section>

            <section class="card block wide" aria-labelledby="td-owner">
              <h2 id="td-owner"><lucide-icon [img]="UserCog" [size]="18" [strokeWidth]="2.2"></lucide-icon> Usuario principal</h2>
              @if (o.owner; as ow) {
                <div class="danger-row">
                  <div>
                    <strong>{{ ow.name || ow.email }}</strong>
                    <p class="muted">{{ ow.email }} · {{ ow.lastAccessAt ? 'último acceso ' + (ow.lastAccessAt | date:'dd/MM/yyyy HH:mm') : 'nunca ha entrado' }}{{ ow.mustChangePassword ? ' · debe cambiar la contraseña' : '' }}</p>
                  </div>
                  <div class="owner-actions">
                    <button class="btn btn-secondary btn-sm" type="button" (click)="openRecover(ow)">
                      <lucide-icon [img]="KeyRound" [size]="15"></lucide-icon> Recuperar cuenta
                    </button>
                    <button class="btn btn-ghost btn-sm" type="button" (click)="openAssign()">
                      <lucide-icon [img]="UserPlus" [size]="15"></lucide-icon> Nombrar otro
                    </button>
                  </div>
                </div>
              } @else {
                <div class="danger-row">
                  <p class="muted">La empresa no tiene un administrador activo. Recupera uno desactivado o nombra uno.</p>
                  <button class="btn btn-primary btn-sm" type="button" (click)="openAssign()">
                    <lucide-icon [img]="UserPlus" [size]="15"></lucide-icon> Nombrar administrador
                  </button>
                </div>
              }
            </section>

            <section class="card block wide" aria-labelledby="td-users">
              <h2 id="td-users"><lucide-icon [img]="Users" [size]="18" [strokeWidth]="2.2"></lucide-icon> Usuarios ({{ o.users.length }})</h2>
              @if (o.users.length === 0) {
                <p class="muted">La empresa no tiene usuarios.</p>
              } @else {
                <div class="table-wrap table-cards">
                  <table>
                    <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead>
                    <tbody>
                      @for (u of o.users; track u._id) {
                        <tr>
                          <td data-label="Nombre">{{ u.name || '—' }}</td>
                          <td data-label="Correo">{{ u.email }}</td>
                          <td data-label="Rol">{{ roleLabel(u.role) }}</td>
                          <td data-label="Estado">
                            <span class="badge" [class.badge-success]="u.isActive" [class.badge-danger]="!u.isActive">{{ u.isActive ? 'Activo' : 'Desactivado' }}</span>
                          </td>
                          <td data-label="Último acceso">{{ u.lastAccessAt ? (u.lastAccessAt | date:'dd/MM/yyyy HH:mm') : 'Nunca' }}</td>
                          <td>
                            @if (u.role === 'TENANT_ADMIN') {
                              <button class="btn btn-ghost btn-sm" type="button" (click)="openRecover(u)" [attr.aria-label]="'Recuperar la cuenta de ' + u.email">Recuperar</button>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </section>

            <section class="card block wide" aria-labelledby="td-audit">
              <h2 id="td-audit"><lucide-icon [img]="History" [size]="18" [strokeWidth]="2.2"></lucide-icon> Registro</h2>
              @if (audit().length === 0) {
                <p class="muted">Sin acciones registradas.</p>
              } @else {
                <ul class="audit">
                  @for (a of audit(); track a._id) {
                    <li>
                      <strong>{{ actionLabel(a.action) }}</strong>
                      <span class="muted">{{ a.actorEmail || 'Sistema' }} · {{ a.at | date:'dd/MM/yyyy HH:mm' }}</span>
                      @if (changeText(a); as c) { <span class="changes">{{ c }}</span> }
                    </li>
                  }
                </ul>
              }
            </section>

            <section class="card block wide danger-zone" aria-labelledby="td-danger">
              <h2 id="td-danger">Zona de riesgo</h2>
              <div class="danger-row">
                <div>
                  <strong>{{ o.tenant.isActive ? 'Suspender la empresa' : 'Reactivar la empresa' }}</strong>
                  <p class="muted">{{ o.tenant.isActive
                    ? 'Nadie de la empresa podrá entrar, sus sesiones se cierran y sus claves de API dejan de funcionar.'
                    : 'Sus usuarios vuelven a poder entrar y sus claves de API vuelven a funcionar.' }}</p>
                </div>
                <button class="btn" type="button" [class.btn-danger]="o.tenant.isActive" [class.btn-secondary]="!o.tenant.isActive" (click)="toggleActive()">
                  <lucide-icon [img]="Power" [size]="15"></lucide-icon> {{ o.tenant.isActive ? 'Suspender' : 'Reactivar' }}
                </button>
              </div>
              <div class="danger-row">
                <div>
                  <strong>Eliminar la empresa</strong>
                  <p class="muted">Borra la empresa, sus usuarios y todos sus datos. No se puede deshacer.</p>
                </div>
                <button class="btn btn-danger" type="button" (click)="openDelete()">
                  <lucide-icon [img]="Trash2" [size]="15"></lucide-icon> Eliminar
                </button>
              </div>
            </section>
          </div>
        }
      </app-form-page>
    </form>

    @if (deleteOpen()) {
      <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="del-title" (keydown.escape)="deleteOpen.set(false)">
        <div class="card del-modal">
          <div class="del-head">
            <h2 id="del-title">Eliminar {{ overview()?.tenant?.name }}</h2>
            <button class="btn-icon btn-ghost" type="button" (click)="deleteOpen.set(false)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20"></lucide-icon>
            </button>
          </div>
          <p class="muted">Se borrarán la empresa, sus usuarios, conversaciones, contactos y configuraciones. Escribe el nombre exacto de la empresa para confirmar.</p>
          <label class="label" for="del-name">Nombre de la empresa</label>
          <input id="del-name" class="input" name="confirmName" [(ngModel)]="confirmName" autocomplete="off" />
          <div class="del-actions">
            <button class="btn btn-secondary" type="button" (click)="deleteOpen.set(false)">Cancelar</button>
            <button class="btn btn-danger" type="button" [disabled]="confirmName.trim() !== overview()?.tenant?.name || deleting()" (click)="remove()">
              {{ deleting() ? 'Eliminando…' : 'Eliminar definitivamente' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (recoverFor(); as r) {
      <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="rec-title" (keydown.escape)="recoverFor.set(null)">
        <div class="card del-modal">
          <div class="del-head">
            <h2 id="rec-title">Recuperar la cuenta</h2>
            <button class="btn-icon btn-ghost" type="button" (click)="recoverFor.set(null)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20"></lucide-icon>
            </button>
          </div>
          <p class="muted">{{ r.name || r.email }}: se reactiva, se cierran todas sus sesiones y se restablece la contraseña.</p>
          <label class="label" for="rec-email">Correo de acceso</label>
          <input id="rec-email" class="input" type="email" name="recEmail" [(ngModel)]="recEmail" autocomplete="off" />
          <label class="label" for="rec-mode">Contraseña</label>
          <select id="rec-mode" class="select" name="recMode" [(ngModel)]="recMode">
            <option value="temp">Generar una contraseña temporal</option>
            <option value="email">Enviar un código al correo</option>
          </select>
          <div class="del-actions">
            <button class="btn btn-secondary" type="button" (click)="recoverFor.set(null)">Cancelar</button>
            <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="recover()">{{ busy() ? 'Recuperando…' : 'Recuperar' }}</button>
          </div>
        </div>
      </div>
    }

    @if (assignOpen()) {
      <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="asg-title" (keydown.escape)="assignOpen.set(false)">
        <div class="card del-modal">
          <div class="del-head">
            <h2 id="asg-title">Nombrar administrador</h2>
            <button class="btn-icon btn-ghost" type="button" (click)="assignOpen.set(false)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20"></lucide-icon>
            </button>
          </div>
          <label class="label" for="asg-user">Usuario</label>
          <select id="asg-user" class="select" name="asgUser" [(ngModel)]="assignUserId">
            <option value="">Crear un usuario nuevo</option>
            @for (u of assignable(); track u._id) {
              <option [value]="u._id">{{ u.name || u.email }} · {{ roleLabel(u.role) }}{{ u.isActive ? '' : ' (desactivado)' }}</option>
            }
          </select>
          @if (!assignUserId) {
            <label class="label" for="asg-name">Nombre</label>
            <input id="asg-name" class="input" name="asgName" [(ngModel)]="assignName" maxlength="120" />
            <label class="label" for="asg-email">Correo</label>
            <input id="asg-email" class="input" type="email" name="asgEmail" [(ngModel)]="assignEmail" />
          }
          <div class="del-actions">
            <button class="btn btn-secondary" type="button" (click)="assignOpen.set(false)">Cancelar</button>
            <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="assign()">{{ busy() ? 'Guardando…' : 'Nombrar' }}</button>
          </div>
        </div>
      </div>
    }

    @if (tempPassword(); as tp) {
      <div class="overlay overlay-top" role="dialog" aria-modal="true" aria-labelledby="tmp-title" (keydown.escape)="tempPassword.set(null)">
        <div class="card del-modal">
          <h2 id="tmp-title">Contraseña temporal</h2>
          <p class="muted">Entrégala a {{ tp.email }} por un canal seguro. No se volverá a mostrar; al entrar tendrá que cambiarla.</p>
          <code class="secret">{{ tp.password }}</code>
          <div class="del-actions">
            <button class="btn btn-secondary" type="button" (click)="copy(tp.password)"><lucide-icon [img]="Copy" [size]="15"></lucide-icon> Copiar</button>
            <button class="btn btn-primary" type="button" (click)="tempPassword.set(null)">Listo</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .owner-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .owner-actions .btn { gap: 6px; }
    .overlay-top { z-index: 110; }
    .secret { display: block; padding: 14px 16px; border-radius: var(--radius-md); background: var(--color-bg-app); font-size: 16px; letter-spacing: .04em; user-select: all; overflow-wrap: anywhere; }
    .state { padding: 40px 24px; text-align: center; color: var(--color-text-muted); }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
    .block { padding: 24px; display: flex; flex-direction: column; gap: 14px; }
    .card:hover { transform: none; }
    .wide { grid-column: 1 / -1; }
    h2 { margin: 0; font-family: var(--font-heading); font-size: 17px; display: flex; align-items: center; gap: 8px; }
    .sub { margin: 4px 0 0; font-size: 13px; color: var(--color-text-muted); font-weight: 600; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .label { font-size: 12.5px; font-weight: 600; }
    .muted { margin: 0; font-size: 13px; color: var(--color-text-muted); line-height: 1.5; }
    .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .stat { display: flex; flex-direction: column; gap: 2px; padding: 14px; border-radius: var(--radius-md); background: var(--color-bg-app); }
    .stat lucide-icon { color: var(--color-brand); }
    .stat strong { font-size: 20px; font-family: var(--font-heading); }
    .stat span { font-size: 12px; color: var(--color-text-muted); }
    .accounts { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 13.5px; }
    .accounts li { display: flex; align-items: center; gap: 8px; }
    .accounts strong { margin-left: auto; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--color-text-muted); border-bottom: 1px solid var(--color-border); }
    td { padding: 12px; font-size: 13.5px; border-bottom: 1px solid var(--color-border); }
    tr:last-child td { border-bottom: none; }
    .audit { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .audit li { display: flex; flex-direction: column; gap: 2px; font-size: 13.5px; padding-bottom: 10px; border-bottom: 1px solid var(--color-border); }
    .audit li:last-child { border-bottom: none; }
    .changes { font-size: 12.5px; color: var(--color-text-main); overflow-wrap: anywhere; }
    .danger-zone { border: 1px solid var(--color-error); }
    .danger-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .danger-row .btn { gap: 6px; }
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .del-modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; }
    .del-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .del-head h2 { font-size: 18px; }
    .del-actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 768px) {
      .block { padding: 18px; }
      .row { grid-template-columns: 1fr; }
      .del-modal { padding: 22px 18px; width: calc(100% - 32px); }
      .del-actions .btn { flex: 1; min-height: 46px; }
    }
  `],
})
export class TenantDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Building2 = Building2; readonly Users = Users; readonly MessageCircle = MessageCircle;
  readonly Instagram = Instagram; readonly Facebook = Facebook; readonly Mail = Mail; readonly KeyRound = KeyRound;
  readonly Power = Power; readonly Trash2 = Trash2; readonly X = X; readonly History = History;
  readonly Contact = Contact; readonly MessagesSquare = MessagesSquare; readonly Send = Send;
  readonly UserCog = UserCog; readonly UserPlus = UserPlus; readonly Copy = Copy;

  tenantId = input.required<string>();
  closed = output<void>();
  /** La lista debe recargarse (datos, estado o eliminación). */
  changed = output<void>();

  overview = signal<TenantOverview | null>(null);
  audit = signal<TenantAuditEntry[]>([]);
  loading = signal(true);
  loadError = signal(false);
  saving = signal(false);
  deleteOpen = signal(false);
  deleting = signal(false);
  confirmName = '';
  // HU17: usuario principal.
  recoverFor = signal<TenantUser | null>(null);
  recEmail = '';
  recMode: 'temp' | 'email' = 'temp';
  assignOpen = signal(false);
  assignUserId = '';
  assignName = '';
  assignEmail = '';
  busy = signal(false);
  tempPassword = signal<{ email: string; password: string } | null>(null);
  form: TenantForm = { name: '', email: '', ruc: '', phone: '', plan: 'starter', planExpiresAt: '', trialEndsAt: '' };
  private snapshot = '';

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.loadError.set(false);
    this.http.get<TenantOverview>(`${API}/admin/tenants/${this.tenantId()}/overview`).subscribe({
      next: o => {
        this.overview.set(o);
        this.fillForm(o.tenant);
        this.loading.set(false);
        this.loadAudit();
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(true);
        this.toast.error(err.error?.message || 'No se pudo cargar la empresa');
      },
    });
  }

  loadAudit() {
    this.http.get<TenantAuditEntry[]>(`${API}/admin/tenants/${this.tenantId()}/audit`).subscribe({
      next: list => this.audit.set(list),
      error: () => this.audit.set([]),
    });
  }

  private fillForm(t: TenantRow) {
    this.form = {
      name: t.name, email: t.email, ruc: t.ruc ?? '', phone: t.phone ?? '', plan: t.plan,
      planExpiresAt: dateOnly(t.planExpiresAt), trialEndsAt: dateOnly(t.trialEndsAt),
    };
    this.snapshot = snapshotOf(this.form);
  }

  isDirty() { return !!this.overview() && snapshotOf(this.form) !== this.snapshot; }

  save() {
    if (!this.form.name.trim()) { this.toast.error('La razón social es obligatoria'); return; }
    if (!EMAIL_RE.test(this.form.email.trim())) { this.toast.error('Ingresa un correo válido'); return; }
    this.saving.set(true);
    const body = {
      name: this.form.name.trim(),
      email: this.form.email.trim(),
      ruc: this.form.ruc.trim(),
      phone: this.form.phone.trim(),
      plan: this.form.plan,
      planExpiresAt: this.form.planExpiresAt || null,
      trialEndsAt: this.form.trialEndsAt || null,
    };
    this.http.patch<TenantRow>(`${API}/tenants/${this.tenantId()}`, body).subscribe({
      next: t => {
        this.saving.set(false);
        this.overview.update(o => (o ? { ...o, tenant: t } : o));
        this.fillForm(t);
        this.toast.success('Empresa actualizada');
        this.changed.emit();
        this.loadAudit();
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'No se pudo guardar la empresa');
      },
    });
  }

  async toggleActive() {
    const o = this.overview();
    if (!o) return;
    const next = !o.tenant.isActive;
    const ok = await this.confirm.confirm(next
      ? { title: 'Reactivar empresa', message: `"${o.tenant.name}" volverá a tener acceso a la plataforma.`, confirmText: 'Reactivar' }
      : { title: 'Suspender empresa', message: `Nadie de "${o.tenant.name}" podrá entrar, sus sesiones abiertas se cerrarán y sus claves de API dejarán de funcionar.`, confirmText: 'Suspender', danger: true });
    if (!ok) return;
    this.http.patch<TenantRow>(`${API}/tenants/${this.tenantId()}`, { isActive: next }).subscribe({
      next: t => {
        this.overview.update(cur => (cur ? { ...cur, tenant: t } : cur));
        this.toast.success(next ? 'Empresa reactivada' : 'Empresa suspendida');
        this.changed.emit();
        this.loadAudit();
      },
      error: err => this.toast.error(err.error?.message || 'No se pudo cambiar el estado'),
    });
  }

  openDelete() {
    this.confirmName = '';
    this.deleteOpen.set(true);
  }

  remove() {
    this.deleting.set(true);
    this.http.delete(`${API}/tenants/${this.tenantId()}`, { body: { confirmName: this.confirmName.trim() } }).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteOpen.set(false);
        this.toast.success('Empresa eliminada');
        this.changed.emit();
        this.closed.emit();
      },
      error: err => {
        this.deleting.set(false);
        this.toast.error(err.error?.message || 'No se pudo eliminar la empresa');
      },
    });
  }

  /** Usuarios que pueden pasar a administrador: los que aún no lo son activos. */
  assignable(): TenantUser[] {
    return (this.overview()?.users ?? []).filter(u => u.role !== 'TENANT_ADMIN' || !u.isActive);
  }

  openRecover(u: TenantUser) {
    this.recEmail = u.email;
    this.recMode = 'temp';
    this.recoverFor.set(u);
  }

  recover() {
    const u = this.recoverFor();
    if (!u) return;
    const email = this.recEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { this.toast.error('Ingresa un correo válido'); return; }
    this.busy.set(true);
    this.http.post<{ user: TenantUser; tempPassword?: string }>(
      `${API}/admin/tenants/${this.tenantId()}/owner/recover`,
      { userId: u._id, mode: this.recMode, ...(email !== u.email ? { email } : {}) },
    ).subscribe({
      next: res => {
        this.busy.set(false);
        this.recoverFor.set(null);
        if (res.tempPassword) this.tempPassword.set({ email: res.user.email, password: res.tempPassword });
        this.toast.success(res.tempPassword ? 'Cuenta recuperada' : `Cuenta recuperada; enviamos un código a ${res.user.email}`);
        this.load();
      },
      error: err => {
        this.busy.set(false);
        this.toast.error(err.error?.message || 'No se pudo recuperar la cuenta');
      },
    });
  }

  openAssign() {
    this.assignUserId = '';
    this.assignName = '';
    this.assignEmail = '';
    this.assignOpen.set(true);
  }

  assign() {
    let body: Record<string, string>;
    if (this.assignUserId) body = { userId: this.assignUserId };
    else {
      const name = this.assignName.trim();
      const email = this.assignEmail.trim().toLowerCase();
      if (!name) { this.toast.error('El nombre es obligatorio'); return; }
      if (!EMAIL_RE.test(email)) { this.toast.error('Ingresa un correo válido'); return; }
      body = { name, email };
    }
    this.busy.set(true);
    this.http.post<{ user: TenantUser; tempPassword?: string }>(
      `${API}/admin/tenants/${this.tenantId()}/owner/assign`, body,
    ).subscribe({
      next: res => {
        this.busy.set(false);
        this.assignOpen.set(false);
        if (res.tempPassword) this.tempPassword.set({ email: res.user.email, password: res.tempPassword });
        this.toast.success(`${res.user.name || res.user.email} ahora es administrador`);
        this.load();
      },
      error: err => {
        this.busy.set(false);
        this.toast.error(err.error?.message || 'No se pudo nombrar al administrador');
      },
    });
  }

  copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => this.toast.success('Copiada'),
      () => this.toast.error('No se pudo copiar'),
    );
  }

  roleLabel(role: string) { return ROLE_LABELS[role] ?? role; }
  actionLabel(a: TenantAuditEntry['action']) { return ACTION_LABELS[a] ?? a; }

  changeText(a: TenantAuditEntry): string {
    if (!a.changes) return '';
    return Object.entries(a.changes)
      .map(([k, v]) => `${k}: ${this.fmt(v.from)} → ${this.fmt(v.to)}`)
      .join(' · ');
  }

  private fmt(v: unknown): string {
    if (v === undefined || v === null || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'sí' : 'no';
    return String(v);
  }
}
