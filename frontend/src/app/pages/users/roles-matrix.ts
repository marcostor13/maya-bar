import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { PermissionsService } from '../../auth/permissions.service';
import {
  ModuleActionDef,
  PlatformModule,
  RolesApiService,
  TenantRole,
} from '../../core/api/roles-api.service';
import { LucideAngularModule, Lock, Info, Save, Plus, Trash2 } from 'lucide-angular';

/**
 * Módulos que el administrador conserva siempre. Debe coincidir con
 * `ADMIN_LOCKED_MODULES` del backend: aquí solo sirve para pintar la casilla
 * bloqueada, la regla de verdad la aplica el servidor al guardar.
 */
const ADMIN_LOCKED = ['users', 'settings'];

@Component({
  selector: 'app-roles-matrix',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="matrix-page">
      <div class="matrix-head">
        <p class="matrix-intro">
          Marca a qué módulos accede cada rol y qué puede hacer dentro. Quien
          pierda un acceso dejará de verlo la próxima vez que cargue la
          plataforma.
        </p>
        <button class="btn btn-secondary btn-sm" (click)="startCreate()">
          <lucide-icon [img]="Plus" [size]="14"></lucide-icon>
          Nuevo rol
        </button>
      </div>

      @if (creating()) {
        <div class="create-row">
          <input class="input" placeholder="Nombre del rol (ej: Supervisor de sala)"
            [value]="newLabel()" (input)="newLabel.set($any($event.target).value)"
            (keydown.enter)="confirmCreate()" autofocus />
          <button class="btn btn-primary" (click)="confirmCreate()" [disabled]="!newLabel().trim()">
            Crear
          </button>
          <button class="btn btn-ghost" (click)="creating.set(false)">Cancelar</button>
        </div>
      }

      @if (loading()) {
        <div class="skeleton-list">
          @for (i of [1,2,3,4]; track i) { <div class="skeleton-row"></div> }
        </div>
      } @else if (roles().length === 0) {
        <p class="empty">No se pudieron cargar los roles.</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="th-module">Módulo</th>
                @for (r of roles(); track r.key) {
                  <th class="th-role">
                    <span class="role-label">{{ r.label }}</span>
                    <span class="role-meta">
                      {{ r.modules.length }} módulo(s)
                      @if (!r.isSystem) {
                        <button class="role-del" (click)="removeRole(r)"
                          [title]="'Eliminar el rol ' + r.label">
                          <lucide-icon [img]="Trash2" [size]="11"></lucide-icon>
                        </button>
                      }
                    </span>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (group of groups(); track group.name) {
                <tr class="group-row">
                  <td [attr.colspan]="roles().length + 1">{{ group.name }}</td>
                </tr>
                @for (m of group.modules; track m.key) {
                  <tr>
                    <td class="td-module">
                      <span class="module-label">{{ m.label }}</span>
                      <span class="module-key">{{ m.key }}</span>
                    </td>
                    @for (r of roles(); track r.key) {
                      <td class="td-check">
                        @if (isLocked(r.key, m.key)) {
                          <span class="locked" [title]="lockReason()">
                            <lucide-icon [img]="Lock" [size]="13"></lucide-icon>
                          </span>
                        } @else {
                          <input type="checkbox" class="cell-check"
                            [checked]="has(r, m.key)" [disabled]="saving()"
                            (change)="toggleModule(r, m.key)" />
                        }

                        @if (has(r, m.key)) {
                          <div class="actions-row">
                            @for (a of actionDefs(); track a.key) {
                              <button type="button" class="action-pill"
                                [class.on]="canAct(r, m.key, a.key)"
                                [disabled]="saving()"
                                [title]="a.label + ' en ' + m.label"
                                (click)="toggleAction(r, m.key, a.key)">
                                {{ a.label.charAt(0) }}
                              </button>
                            }
                          </div>
                        }
                      </td>
                    }
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <div class="matrix-foot">
          <span class="foot-note">
            <lucide-icon [img]="Info" [size]="13"></lucide-icon>
            Las letras bajo cada marca son <strong>C</strong>rear,
            <strong>E</strong>ditar y <strong>E</strong>liminar. Apagadas, el rol
            solo consulta. El administrador conserva siempre Usuarios y
            Configuración.
          </span>
          @if (dirty()) {
            <button class="btn btn-primary" (click)="save()" [disabled]="saving()">
              <lucide-icon [img]="Save" [size]="15"></lucide-icon>
              {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .matrix-page { display: flex; flex-direction: column; gap: 16px; }
    .matrix-head { display: flex; align-items: flex-start; justify-content: space-between;
      gap: 16px; flex-wrap: wrap; }
    .matrix-intro { margin: 0; font-size: 14px; color: var(--color-text-muted);
      line-height: 1.6; max-width: 68ch; }

    .create-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .create-row .input { flex: 1; min-width: 240px; }

    .table-wrap { background: #fff; border: 1px solid var(--color-border);
      border-radius: 16px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid var(--color-border); }
    thead th { position: sticky; top: 0; background: var(--color-bg-app);
      padding: 12px 14px; text-align: center; z-index: 1; }
    .th-module { text-align: left; min-width: 210px; }
    .th-role { min-width: 118px; }
    .role-label { display: block; font-size: 12px; font-weight: 700; }
    .role-meta { display: inline-flex; align-items: center; gap: 5px; margin-top: 3px;
      font-size: 10px; color: var(--color-text-muted); }
    .role-del { background: none; border: none; cursor: pointer; padding: 1px;
      color: var(--color-error); display: inline-flex; border-radius: 3px; }
    .role-del:hover { background: #FEF2F2; }

    .group-row td { background: var(--color-bg-app); font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .06em; color: var(--color-text-muted);
      padding: 8px 14px; }

    .td-module { padding: 11px 14px; }
    .module-label { display: block; font-size: 14px; font-weight: 600; }
    .module-key { display: block; font-size: 11px; color: var(--color-text-muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

    .td-check { text-align: center; padding: 9px 14px; }
    .cell-check { width: 16px; height: 16px; accent-color: var(--color-brand); cursor: pointer; }
    .cell-check:disabled { cursor: not-allowed; opacity: .5; }
    .locked { display: inline-flex; color: var(--color-text-muted); opacity: .55; }

    .actions-row { display: flex; gap: 3px; justify-content: center; margin-top: 6px; }
    .action-pill { width: 20px; height: 20px; border-radius: 5px; cursor: pointer;
      border: 1px solid var(--color-border); background: #fff; font-size: 10px;
      font-weight: 700; color: var(--color-text-muted); line-height: 1;
      transition: all .15s; padding: 0; }
    .action-pill:hover:not(:disabled) { border-color: var(--color-brand); }
    .action-pill.on { background: var(--color-brand); border-color: var(--color-brand); color: #fff; }
    .action-pill:disabled { opacity: .5; cursor: not-allowed; }

    tbody tr:last-child td { border-bottom: none; }
    tbody tr:not(.group-row):hover td { background: var(--color-bg-app); }

    .matrix-foot { display: flex; align-items: center; justify-content: space-between;
      gap: 16px; flex-wrap: wrap; }
    .foot-note { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px;
      color: var(--color-text-muted); max-width: 66ch; line-height: 1.5; }
    .empty { color: var(--color-text-muted); font-size: 14px; }

    .skeleton-list { display: flex; flex-direction: column; gap: 10px; }
    .skeleton-row { height: 46px; border-radius: 12px;
      background: linear-gradient(90deg, var(--color-bg-app) 25%, #EEF2F7 50%, var(--color-bg-app) 75%);
      background-size: 200% 100%; animation: shimmer 1.3s infinite; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

    @media (max-width: 768px) {
      .matrix-foot { flex-direction: column; align-items: stretch; }
      .matrix-foot .btn { width: 100%; justify-content: center; }
    }
  `],
})
export class RolesMatrixComponent implements OnInit {
  private api = inject(RolesApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private permissions = inject(PermissionsService);

  readonly Lock = Lock;
  readonly Info = Info;
  readonly Save = Save;
  readonly Plus = Plus;
  readonly Trash2 = Trash2;

  modules = signal<PlatformModule[]>([]);
  actionDefs = signal<ModuleActionDef[]>([]);
  roles = signal<TenantRole[]>([]);
  loading = signal(true);
  saving = signal(false);

  creating = signal(false);
  newLabel = signal('');

  private touched = signal<Set<string>>(new Set());
  dirty = computed(() => this.touched().size > 0);

  groups = computed(() => {
    const byGroup = new Map<string, PlatformModule[]>();
    for (const m of this.modules()) {
      if (!byGroup.has(m.group)) byGroup.set(m.group, []);
      byGroup.get(m.group)!.push(m);
    }
    return [...byGroup.entries()].map(([name, modules]) => ({ name, modules }));
  });

  ngOnInit() {
    this.api.catalog().subscribe({
      next: (c) => {
        this.modules.set(c.modules);
        this.actionDefs.set(c.actions);
      },
      error: () => this.toast.error('No se pudo cargar el catálogo de módulos'),
    });
    this.reload();
  }

  private reload() {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (r) => {
        this.roles.set(r);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('No se pudieron cargar los roles');
      },
    });
  }

  has(role: TenantRole, moduleKey: string): boolean {
    return role.modules.includes(moduleKey);
  }

  /** Sin restricción guardada se permiten todas las acciones. */
  canAct(role: TenantRole, moduleKey: string, action: string): boolean {
    const allowed = role.actions?.[moduleKey];
    return allowed === undefined ? true : allowed.includes(action);
  }

  isLocked(roleKey: string, moduleKey: string): boolean {
    return roleKey === 'TENANT_ADMIN' && ADMIN_LOCKED.includes(moduleKey);
  }

  lockReason(): string {
    return 'El administrador conserva siempre este módulo para no quedarse sin acceso';
  }

  toggleModule(role: TenantRole, moduleKey: string) {
    this.roles.update((list) =>
      list.map((r) => {
        if (r.key !== role.key) return r;
        const on = r.modules.includes(moduleKey);
        const actions = { ...(r.actions ?? {}) };
        // Quitar el módulo también limpia sus acciones: guardarlas sería basura.
        if (on) delete actions[moduleKey];
        return {
          ...r,
          modules: on
            ? r.modules.filter((m) => m !== moduleKey)
            : [...r.modules, moduleKey],
          actions,
        };
      }),
    );
    this.touched.update((s) => new Set(s).add(role.key));
  }

  toggleAction(role: TenantRole, moduleKey: string, action: string) {
    this.roles.update((list) =>
      list.map((r) => {
        if (r.key !== role.key) return r;
        const all = this.actionDefs().map((a) => a.key);
        // La primera vez que se toca hay que materializar "todas", porque el
        // estado implícito no se puede modificar parcialmente.
        const current = r.actions?.[moduleKey] ?? all;
        const next = current.includes(action)
          ? current.filter((a) => a !== action)
          : [...current, action];
        return { ...r, actions: { ...(r.actions ?? {}), [moduleKey]: next } };
      }),
    );
    this.touched.update((s) => new Set(s).add(role.key));
  }

  startCreate() {
    this.newLabel.set('');
    this.creating.set(true);
  }

  confirmCreate() {
    const label = this.newLabel().trim();
    if (!label) return;
    this.api.create(label).subscribe({
      next: () => {
        this.creating.set(false);
        this.toast.success(`Rol "${label}" creado. Marca sus accesos abajo.`);
        this.reload();
      },
      error: (err) =>
        this.toast.error(err.error?.message || 'No se pudo crear el rol'),
    });
  }

  async removeRole(role: TenantRole) {
    const enUso = role.userCount ?? 0;
    const ok = await this.confirm.confirm({
      title: `Eliminar el rol ${role.label}`,
      message: enUso
        ? `${enUso} usuario(s) tienen este rol. Cámbialos de rol antes de eliminarlo.`
        : 'El rol dejará de estar disponible al crear o editar usuarios.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;

    this.api.remove(role.key).subscribe({
      next: () => {
        this.toast.success('Rol eliminado');
        this.reload();
      },
      error: (err) =>
        this.toast.error(err.error?.message || 'No se pudo eliminar el rol'),
    });
  }

  save() {
    const pending = this.roles().filter((r) => this.touched().has(r.key));
    if (!pending.length) return;

    this.saving.set(true);
    let done = 0;
    let failed = false;

    for (const role of pending) {
      this.api.update(role.key, role.modules, role.actions ?? {}).subscribe({
        next: (updated) => {
          // El servidor puede devolver más módulos de los enviados si alguno
          // estaba bloqueado; se refleja lo que quedó guardado de verdad.
          this.roles.update((list) =>
            list.map((r) =>
              r.key === updated.key ? { ...updated, userCount: r.userCount } : r,
            ),
          );
          if (++done >= pending.length) this.finish(failed);
        },
        error: (err) => {
          failed = true;
          this.toast.error(
            err.error?.message || `No se pudo guardar el rol ${role.label}`,
          );
          if (++done >= pending.length) this.finish(true);
        },
      });
    }
  }

  private finish(hadErrors: boolean) {
    this.saving.set(false);
    this.touched.set(new Set());
    if (!hadErrors) this.toast.success('Accesos actualizados');
    // Si el administrador se cambió sus propios accesos, su menú debe reflejarlo
    // sin obligarle a volver a entrar.
    void this.permissions.refresh();
  }
}
