import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Shuffle, Plus, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { FormPageComponent, snapshotOf } from '../../shared/form-page';
import { environment } from '../../../environments/environment';

type Mode = 'round_robin' | 'least_open' | 'weighted';
type Target = 'leads' | 'contacts' | 'both';
type MatchKind = 'any' | 'contact_source' | 'form' | 'lead_source';

export interface RoutingRule {
  _id?: string;
  name: string;
  active: boolean;
  order?: number;
  appliesTo: Target;
  match: { kind: MatchKind; value?: string };
  mode: Mode;
  members: { userId: string | { _id: string; name?: string; email?: string }; weight: number }[];
  responseMinutes?: number | null;
  onTimeout: 'next' | 'pool';
}

interface Owner { _id: string; name: string; email: string; role: string; openLeads: number }
interface LogEntry {
  _id: string; at: string; reason: string; detail?: string;
  userId?: { name?: string }; fromUserId?: { name?: string };
  leadId?: { title?: string }; customerId?: { name?: string }; ruleId?: { name?: string };
}

const SELLER_ROLES = ['TENANT_ADMIN', 'MANAGER', 'MARKETING', 'IMPULSADOR'];
const idOf = (u: RoutingRule['members'][number]['userId']) => (typeof u === 'string' ? u : u._id);

/** Configuración → Reparto automático (HU59): reglas, grupos y bitácora. */
@Component({
  selector: 'app-routing-settings',
  standalone: true,
  imports: [FormsModule, DatePipe, LucideAngularModule, FormPageComponent],
  template: `
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon"><lucide-icon [img]="Shuffle" [size]="22" class="brand" /></div>
        <div class="grow">
          <h2 class="section-title">Reparto automático</h2>
          <p class="section-desc">Las oportunidades y contactos nuevos sin responsable se asignan solos. Se aplica la primera regla activa que coincide.</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" (click)="openNew()"><lucide-icon [img]="Plus" [size]="15" /> Nueva regla</button>
      </div>

      @if (rules().length === 0) {
        <p class="empty">Aún no hay reglas: lo nuevo queda en la bolsa hasta que alguien lo tome.</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Orden</th><th>Regla</th><th>Origen</th><th>Modo</th><th>Grupo</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @for (r of rules(); track r._id; let i = $index; let last = $last) {
                <tr>
                  <td class="order">
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [disabled]="i === 0 || busy()" (click)="move(i, -1)" aria-label="Subir"><lucide-icon [img]="ArrowUp" [size]="14" /></button>
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [disabled]="last || busy()" (click)="move(i, 1)" aria-label="Bajar"><lucide-icon [img]="ArrowDown" [size]="14" /></button>
                  </td>
                  <td><strong>{{ r.name }}</strong><div class="muted">{{ targetLabel[r.appliesTo] }}</div></td>
                  <td>{{ matchText(r) }}</td>
                  <td>{{ modeLabel[r.mode] }}@if (r.responseMinutes) { <div class="muted">Responder en {{ r.responseMinutes }} min</div> }</td>
                  <td>{{ memberNames(r) }}</td>
                  <td>
                    <button type="button" class="badge" [class.badge-success]="r.active" [class.badge-neutral]="!r.active" [disabled]="busy()" (click)="toggle(r)">
                      {{ r.active ? 'Activa' : 'Pausada' }}
                    </button>
                  </td>
                  <td class="row-actions">
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="openEdit(r)" aria-label="Editar"><lucide-icon [img]="Pencil" [size]="15" /></button>
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [disabled]="busy()" (click)="remove(r)" aria-label="Eliminar"><lucide-icon [img]="Trash2" [size]="15" /></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (log().length) {
        <h3 class="sub-title">Últimas asignaciones</h3>
        <ul class="log">
          @for (l of log(); track l._id) {
            <li>
              <span class="when">{{ l.at | date: 'dd/MM HH:mm' }}</span>
              <span>{{ logText(l) }}</span>
            </li>
          }
        </ul>
      }
    </div>

    @if (editing(); as e) {
      <app-form-page [title]="e._id ? e.name : 'Nueva regla de reparto'" subtitle="A quién le llega lo nuevo y en qué orden."
        backLabel="Configuración" [urlKey]="e._id || 'nueva-regla-reparto'" [dirty]="isDirty()" (closed)="editing.set(null)">
        <ng-container formActions>
          <button type="button" class="btn btn-ghost" (click)="editing.set(null)">Cancelar</button>
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="save()">Guardar</button>
        </ng-container>

        <div class="card form">
          <label class="field">Nombre
            <input class="input" [(ngModel)]="e.name" placeholder="Ej.: Leads de WhatsApp" maxlength="120" />
          </label>
          <div class="grid">
            <label class="field">Se aplica a
              <select class="select" [(ngModel)]="e.appliesTo">
                <option value="leads">Oportunidades</option>
                <option value="contacts">Contactos</option>
                <option value="both">Ambos</option>
              </select>
            </label>
            <label class="field">Origen
              <select class="select" [(ngModel)]="e.match.kind">
                <option value="any">Cualquiera</option>
                <option value="contact_source">Canal del contacto</option>
                <option value="form">Formulario</option>
                <option value="lead_source">Origen de la oportunidad</option>
              </select>
            </label>
            @if (e.match.kind !== 'any') {
              <label class="field">{{ e.match.kind === 'form' ? 'Id del formulario' : 'Valor del origen' }}
                <input class="input" [(ngModel)]="e.match.value" [placeholder]="e.match.kind === 'form' ? 'Id del formulario' : 'whatsapp, form, api…'" />
              </label>
            }
            <label class="field">Modo
              <select class="select" [(ngModel)]="e.mode">
                <option value="round_robin">Turno rotativo</option>
                <option value="least_open">Quien tenga menos abiertas</option>
                <option value="weighted">Ponderado por peso</option>
              </select>
            </label>
            <label class="field">Tiempo para responder (min)
              <input class="input" type="number" min="1" [(ngModel)]="e.responseMinutes" placeholder="Sin límite" />
            </label>
            @if (e.responseMinutes) {
              <label class="field">Si no responde
                <select class="select" [(ngModel)]="e.onTimeout">
                  <option value="next">Pasa al siguiente</option>
                  <option value="pool">Vuelve a la bolsa</option>
                </select>
              </label>
            }
          </div>
          <label class="check"><input type="checkbox" [(ngModel)]="e.active" /> Regla activa</label>

          <h3 class="sub-title">Grupo de vendedores</h3>
          <p class="muted">Solo reciben quienes estén disponibles y dentro de su horario.</p>
          <div class="members">
            @for (o of sellers(); track o._id) {
              <div class="member">
                <label class="check"><input type="checkbox" [checked]="inGroup(o._id)" (change)="setMember(o._id, $any($event.target).checked)" />
                  {{ o.name || o.email }} <span class="muted">· {{ o.openLeads }} abiertas</span></label>
                @if (e.mode === 'weighted' && inGroup(o._id)) {
                  <input class="input weight" type="number" min="0.1" step="0.5" [ngModel]="weightOf(o._id)" (ngModelChange)="setWeight(o._id, $event)" aria-label="Peso" />
                }
              </div>
            }
          </div>
        </div>
      </app-form-page>
    }
  `,
  styles: [`
    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .grow { flex: 1; min-width: 200px; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); background: var(--color-brand-light); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .brand { color: var(--color-brand); }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc, .muted { font-size: 13px; color: var(--color-text-muted); margin: 0; }
    .empty { color: var(--color-text-muted); font-size: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
    .order { white-space: nowrap; }
    .row-actions { white-space: nowrap; text-align: right; }
    .badge { border: none; cursor: pointer; }
    .sub-title { font-family: var(--font-heading); font-size: 15px; margin: 24px 0 8px; }
    .log { list-style: none; margin: 0; padding: 0; font-size: 13px; }
    .log li { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--color-border); }
    .when { color: var(--color-text-muted); white-space: nowrap; }
    .form { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
    .check { display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .members { display: flex; flex-direction: column; gap: 8px; }
    .member { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .weight { width: 96px; }
    @media (max-width: 768px) { .section-card { padding: 20px; } }
  `],
})
export class RoutingSettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private api = `${environment.apiUrl}/routing`;

  readonly Shuffle = Shuffle; readonly Plus = Plus; readonly Pencil = Pencil; readonly Trash2 = Trash2;
  readonly ArrowUp = ArrowUp; readonly ArrowDown = ArrowDown;
  readonly modeLabel: Record<Mode, string> = { round_robin: 'Turno rotativo', least_open: 'Menos abiertas', weighted: 'Ponderado' };
  readonly targetLabel: Record<Target, string> = { leads: 'Oportunidades', contacts: 'Contactos', both: 'Oportunidades y contactos' };

  rules = signal<RoutingRule[]>([]);
  log = signal<LogEntry[]>([]);
  owners = signal<Owner[]>([]);
  editing = signal<RoutingRule | null>(null);
  busy = signal(false);
  private snapshot = '';
  sellers = computed(() => this.owners().filter((o) => SELLER_ROLES.includes(o.role)));

  ngOnInit() {
    this.load();
    this.http.get<Owner[]>(`${environment.apiUrl}/leads/owners`).subscribe({ next: (o) => this.owners.set(o), error: () => undefined });
  }

  load() {
    this.http.get<RoutingRule[]>(`${this.api}/rules`).subscribe({ next: (r) => this.rules.set(r), error: () => undefined });
    this.http.get<LogEntry[]>(`${this.api}/log?limit=20`).subscribe({ next: (l) => this.log.set(l), error: () => undefined });
  }

  isDirty = () => !!this.editing() && snapshotOf(this.editing()) !== this.snapshot;

  openNew() {
    this.edit({ name: '', active: true, appliesTo: 'leads', match: { kind: 'any' }, mode: 'round_robin', members: [], responseMinutes: null, onTimeout: 'next' });
  }

  openEdit(r: RoutingRule) {
    this.edit({ ...r, match: { ...r.match }, members: r.members.map((m) => ({ userId: idOf(m.userId), weight: m.weight })) });
  }

  private edit(r: RoutingRule) {
    this.snapshot = snapshotOf(r);
    this.editing.set(r);
  }

  inGroup = (id: string) => !!this.editing()?.members.some((m) => idOf(m.userId) === id);
  weightOf = (id: string) => this.editing()?.members.find((m) => idOf(m.userId) === id)?.weight ?? 1;

  setMember(id: string, on: boolean) {
    const e = this.editing();
    if (!e) return;
    const members = on ? [...e.members, { userId: id, weight: 1 }] : e.members.filter((m) => idOf(m.userId) !== id);
    this.editing.set({ ...e, members });
  }

  setWeight(id: string, w: number) {
    const e = this.editing();
    if (!e) return;
    this.editing.set({ ...e, members: e.members.map((m) => (idOf(m.userId) === id ? { ...m, weight: Number(w) || 1 } : m)) });
  }

  matchText(r: RoutingRule) {
    switch (r.match.kind) {
      case 'contact_source': return `Canal: ${r.match.value}`;
      case 'form': return 'Formulario concreto';
      case 'lead_source': return `Origen: ${r.match.value}`;
      default: return 'Cualquiera';
    }
  }

  memberNames(r: RoutingRule) {
    return r.members.map((m) => (typeof m.userId === 'string' ? m.userId : m.userId.name || m.userId.email)).join(', ');
  }

  logText(l: LogEntry) {
    const what = l.leadId?.title ?? l.customerId?.name ?? 'Elemento';
    const to = l.userId?.name ?? '';
    switch (l.reason) {
      case 'owner': return `${what} → ${to} (responsable del contacto)`;
      case 'timeout_next': return `${what}: ${l.fromUserId?.name ?? 'el anterior'} no respondió; pasó a ${to}`;
      case 'timeout_pool': return `${what}: ${l.fromUserId?.name ?? 'el responsable'} no respondió; volvió a la bolsa`;
      case 'no_one': return `${what}: nadie disponible, queda en la bolsa`;
      default: return `${what} → ${to}${l.ruleId?.name ? ` (${l.ruleId.name})` : ''}`;
    }
  }

  private body(r: RoutingRule) {
    return {
      name: r.name, active: r.active, appliesTo: r.appliesTo, match: r.match, mode: r.mode,
      members: r.members.map((m) => ({ userId: idOf(m.userId), weight: m.weight })),
      responseMinutes: r.responseMinutes || null, onTimeout: r.onTimeout,
      ...(r.order !== undefined ? { order: r.order } : {}),
    };
  }

  save() {
    const e = this.editing();
    if (!e) return;
    if (!e.name.trim()) { this.toast.error('Ponle un nombre a la regla'); return; }
    if (!e.members.length) { this.toast.error('Añade al menos un vendedor al grupo'); return; }
    this.busy.set(true);
    const req = e._id ? this.http.put(`${this.api}/rules/${e._id}`, this.body(e)) : this.http.post(`${this.api}/rules`, this.body(e));
    req.subscribe({
      next: () => { this.busy.set(false); this.editing.set(null); this.toast.success('Regla guardada'); this.load(); },
      error: (err: { error?: { message?: string } }) => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo guardar la regla'); },
    });
  }

  toggle(r: RoutingRule) {
    this.busy.set(true);
    this.http.put(`${this.api}/rules/${r._id}`, this.body({ ...r, active: !r.active })).subscribe({
      next: () => { this.busy.set(false); this.toast.success(r.active ? 'Regla pausada' : 'Regla activada'); this.load(); },
      error: (err: { error?: { message?: string } }) => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo cambiar'); },
    });
  }

  move(i: number, dir: -1 | 1) {
    const list = [...this.rules()];
    const j = i + dir;
    [list[i], list[j]] = [list[j], list[i]];
    this.busy.set(true);
    let pending = list.length;
    let failed = false;
    list.forEach((r, order) => {
      this.http.put(`${this.api}/rules/${r._id}`, this.body({ ...r, order })).subscribe({
        next: () => { if (--pending === 0) this.done(failed); },
        error: () => { failed = true; if (--pending === 0) this.done(failed); },
      });
    });
  }

  private done(failed: boolean) {
    this.busy.set(false);
    if (failed) this.toast.error('No se pudo cambiar el orden');
    else this.toast.success('Orden actualizado');
    this.load();
  }

  async remove(r: RoutingRule) {
    const ok = await this.confirm.confirm({ title: 'Eliminar regla', message: `¿Eliminar la regla "${r.name}"? Lo nuevo que coincidía irá a la siguiente regla o a la bolsa.`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.busy.set(true);
    this.http.delete(`${this.api}/rules/${r._id}`).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Regla eliminada'); this.load(); },
      error: (err: { error?: { message?: string } }) => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo eliminar'); },
    });
  }
}
