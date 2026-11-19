import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Subscription } from 'rxjs';
import { LucideAngularModule, Users, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-angular';
import { formatValue } from '../../shared/charts';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export type UserMetric =
  | 'messages' | 'openChats' | 'newLeads' | 'wonDeals' | 'wonValue'
  | 'lostDeals' | 'newContacts' | 'assignedContacts' | 'idleContacts' | 'activities' | 'calls';

export interface UserPerformanceRow extends Record<UserMetric, number> {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface UserPerformance {
  scope: 'team' | 'self';
  channel: string | null;
  users: UserPerformanceRow[];
  totals: Record<UserMetric, number>;
}

const COLUMNS: { key: UserMetric; label: string; hint: string; money?: boolean }[] = [
  { key: 'messages', label: 'Mensajes', hint: 'Enviados a mano desde la bandeja' },
  { key: 'openChats', label: 'Chats asignados', hint: 'Los que atiende ahora mismo' },
  { key: 'newLeads', label: 'Leads nuevos', hint: 'Oportunidades creadas a su nombre' },
  { key: 'wonDeals', label: 'Ganados', hint: 'Oportunidades ganadas' },
  { key: 'wonValue', label: 'Valor ganado', hint: 'Suma de las ganadas', money: true },
  { key: 'lostDeals', label: 'Perdidos', hint: 'Oportunidades perdidas' },
  { key: 'newContacts', label: 'Contactos nuevos', hint: 'Contactos nuevos a su cargo en el periodo' },
  { key: 'assignedContacts', label: 'A su cargo', hint: 'Contactos que tiene asignados hoy' },
  { key: 'idleContacts', label: 'Sin seguimiento', hint: 'Contactos a su cargo sin ninguna actividad en el periodo' },
  { key: 'activities', label: 'Actividades', hint: 'Notas, llamadas, reuniones… registradas a mano' },
  { key: 'calls', label: 'Llamadas', hint: 'Llamadas de WhatsApp que atendió' },
];

const ROLE_LABELS: Record<string, string> = {
  TENANT_ADMIN: 'Administrador', MANAGER: 'Gerente', MARKETING: 'Marketing',
  IMPULSADOR: 'Impulsador', HOST: 'Anfitrión', SERVER: 'Mesero', KITCHEN: 'Cocina', BAR: 'Bar',
};

/** Rendimiento de cada usuario en el periodo del dashboard (HU20). */
@Component({
  selector: 'app-user-performance-card',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <section class="card table-card perf" aria-labelledby="up-title">
      <div class="head">
        <h3 id="up-title"><lucide-icon [img]="Users" [size]="18" [strokeWidth]="2.2"></lucide-icon>
          {{ data()?.scope === 'self' ? 'Tu rendimiento' : 'Rendimiento por usuario' }}</h3>
        <span class="muted">{{ channel() ? 'Mensajes y chats solo del canal elegido' : 'Todos los canales' }}</span>
      </div>

      @if (loading()) {
        <p class="muted">Calculando…</p>
      } @else if (error()) {
        <p class="muted" role="alert">No se pudo cargar el rendimiento por usuario.
          <button class="btn btn-ghost btn-sm" type="button" (click)="load()">Reintentar</button></p>
      } @else if (!rows().length) {
        <p class="muted">No hay usuarios activos en tu empresa.</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" [attr.aria-sort]="ariaSort('name')">
                  <button type="button" class="sort" (click)="sortBy('name')">Usuario
                    <lucide-icon [img]="sortIcon('name')" [size]="13"></lucide-icon></button>
                </th>
                @for (c of columns; track c.key) {
                  <th scope="col" class="num" [attr.aria-sort]="ariaSort(c.key)" [title]="c.hint">
                    <button type="button" class="sort" (click)="sortBy(c.key)">{{ c.label }}
                      <lucide-icon [img]="sortIcon(c.key)" [size]="13"></lucide-icon></button>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (u of rows(); track u.id) {
                <tr>
                  <th scope="row">
                    <span class="name">{{ u.name }}</span>
                    <span class="role">{{ roleLabel(u.role) }}</span>
                  </th>
                  @for (c of columns; track c.key) {
                    <td class="num" [class.zero]="!u[c.key]" [class.warn]="c.key === 'idleContacts' && u[c.key] > 0">{{ fmt(u[c.key], c.money) }}</td>
                  }
                </tr>
              }
            </tbody>
            @if (data()!.scope === 'team' && rows().length > 1) {
              <tfoot>
                <tr>
                  <th scope="row">Total del equipo</th>
                  @for (c of columns; track c.key) {
                    <td class="num">{{ fmt(data()!.totals[c.key], c.money) }}</td>
                  }
                </tr>
              </tfoot>
            }
          </table>
        </div>
        <p class="note">«Chats asignados» (abiertos) y «A su cargo» son de hoy; el resto es del periodo elegido. Solo salen los usuarios activos.</p>
      }
    </section>
  `,
  styles: [`
    .perf { padding: 24px; display: flex; flex-direction: column; gap: 12px; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    h3 { margin: 0; font-family: var(--font-heading); font-size: 16px; display: flex; align-items: center; gap: 8px; }
    .muted { margin: 0; font-size: 13px; color: var(--color-text-muted); }
    .note { margin: 0; font-size: 12px; color: var(--color-text-muted); }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--color-border); }
    thead th { font-size: 12px; font-weight: 600; color: var(--color-text-muted); }
    tbody th { font-weight: 500; }
    tfoot th, tfoot td { font-weight: 700; border-bottom: none; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .zero { color: var(--color-text-muted); }
    .warn { color: var(--color-warning); font-weight: 600; }
    .name { display: block; }
    .role { display: block; font-size: 11.5px; color: var(--color-text-muted); }
    .sort { background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer;
      display: inline-flex; align-items: center; gap: 4px; }
    .sort:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; border-radius: 4px; }
  `],
})
export class UserPerformanceCardComponent {
  private http = inject(HttpClient);

  readonly Users = Users;
  readonly columns = COLUMNS;

  range = input<string>('30d');
  channel = input<string>('');

  data = signal<UserPerformance | null>(null);
  loading = signal(true);
  error = signal(false);
  sortKey = signal<UserMetric | 'name'>('wonValue');
  sortDir = signal<'asc' | 'desc'>('desc');
  private req?: Subscription;

  rows = computed(() => {
    const list = [...(this.data()?.users ?? [])];
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return list.sort((a, b) =>
      key === 'name'
        ? a.name.localeCompare(b.name, 'es') * dir
        : (a[key] - b[key]) * dir || a.name.localeCompare(b.name, 'es'),
    );
  });

  constructor() {
    effect(() => {
      this.range();
      this.channel();
      this.load();
    });
  }

  load() {
    this.loading.set(true);
    this.error.set(false);
    const params: Record<string, string> = {
      range: this.range(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    if (this.channel()) params['channel'] = this.channel();
    // Si se cambia rápido de periodo o canal, la respuesta vieja no pisa a la nueva.
    this.req?.unsubscribe();
    this.req = this.http.get<UserPerformance>(`${API}/dashboard/users`, { params }).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); },
    });
  }

  sortBy(key: UserMetric | 'name') {
    if (this.sortKey() === key) this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'name' ? 'asc' : 'desc');
    }
  }

  ariaSort(key: UserMetric | 'name') {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  sortIcon(key: UserMetric | 'name') {
    if (this.sortKey() !== key) return ArrowUpDown;
    return this.sortDir() === 'asc' ? ArrowUp : ArrowDown;
  }

  roleLabel(r: string) { return ROLE_LABELS[r] ?? r; }
  fmt(v: number, money?: boolean) { return formatValue(v ?? 0, money ? 'money' : undefined); }
}
