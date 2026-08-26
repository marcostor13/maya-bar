import {
  Component,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import {
  ContactForm,
  FormField,
  FormFieldMapTo,
  FormFieldType,
  FormPayload,
  FormSubmission,
  FormsApiService,
} from '../../core/api/forms-api.service';
import { environment } from '../../../environments/environment';
import {
  LucideAngularModule,
  Plus,
  Pencil,
  Trash2,
  X,
  Code2,
  Copy,
  Check,
  Inbox,
  FileText,
  RefreshCw,
  KeyRound,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from 'lucide-angular';

interface ListMini {
  _id: string;
  name: string;
  color: string;
  type: string;
}

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Teléfono' },
  { value: 'number', label: 'Número' },
  { value: 'textarea', label: 'Texto largo' },
  { value: 'select', label: 'Lista desplegable' },
  { value: 'checkbox', label: 'Casilla' },
  { value: 'date', label: 'Fecha' },
];

const MAP_TARGETS: { value: FormFieldMapTo; label: string }[] = [
  { value: '', label: 'Dato extra' },
  { value: 'name', label: 'Nombre del contacto' },
  { value: 'email', label: 'Email del contacto' },
  { value: 'phone', label: 'Teléfono del contacto' },
  { value: 'notes', label: 'Notas del contacto' },
];

/** Campos habituales, para no construir cada formulario desde cero. */
const PRESET_FIELDS: FormField[] = [
  { key: 'nombre', label: 'Nombre', type: 'text', placeholder: 'Tu nombre', required: true, options: [], mapTo: 'name' },
  { key: 'email', label: 'Email', type: 'email', placeholder: 'tu@email.com', required: true, options: [], mapTo: 'email' },
  { key: 'telefono', label: 'Teléfono', type: 'tel', placeholder: '+51 999 999 999', required: false, options: [], mapTo: 'phone' },
  { key: 'mensaje', label: 'Mensaje', type: 'textarea', placeholder: '¿En qué podemos ayudarte?', required: false, options: [], mapTo: 'notes' },
];

const API = environment.apiUrl;

@Component({
  selector: 'app-forms',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">

      <!-- ── Header ── -->
      <div class="page-header">
        <div>
          <h1>Formularios</h1>
          <p class="subtitle">Crea un formulario, publícalo como API y recibe los contactos de cualquier landing directamente aquí.</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" (click)="openEditor(null)">
            <lucide-icon [img]="Plus" [size]="16" [strokeWidth]="2.5"></lucide-icon>
            Nuevo formulario
          </button>
        </div>
      </div>

      <!-- ── Stats ── -->
      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-value">{{ forms().length }}</span>
          <span class="stat-label">Formularios</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ activeCount() }}</span>
          <span class="stat-label">Activos</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ totalSubmissions() }}</span>
          <span class="stat-label">Envíos recibidos</span>
        </div>
      </div>

      <!-- ── Tabla ── -->
      @if (loading()) {
        <div class="card skeleton-list">
          @for (i of [1,2,3]; track i) { <div class="skeleton-row"></div> }
        </div>
      } @else if (forms().length === 0) {
        <div class="empty-state card">
          <div class="empty-icon"><lucide-icon [img]="FileText" [size]="48" [strokeWidth]="1.5"></lucide-icon></div>
          <h3>Sin formularios</h3>
          <p>Crea tu primer formulario para capturar contactos desde tu web, una landing o cualquier página externa.</p>
          <button class="btn btn-primary" (click)="openEditor(null)">
            <lucide-icon [img]="Plus" [size]="16"></lucide-icon>
            Crear formulario
          </button>
        </div>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Formulario</th>
                <th>Campos</th>
                <th>Envíos</th>
                <th>Último envío</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (f of forms(); track f._id) {
                <tr>
                  <td class="form-td">
                    <div class="form-cell">
                      <div class="form-icon"><lucide-icon [img]="FileText" [size]="18"></lucide-icon></div>
                      <div class="form-info">
                        <span class="form-name">{{ f.name }}</span>
                        <span class="form-desc">{{ f.description || 'Sin descripción' }}</span>
                      </div>
                    </div>
                  </td>
                  <td data-label="Campos">
                    <div class="tags-cell">
                      @for (field of f.fields.slice(0, 3); track field.key) {
                        <span class="badge badge-neutral tag-badge">{{ field.label }}</span>
                      }
                      @if (f.fields.length > 3) {
                        <span class="badge badge-neutral">+{{ f.fields.length - 3 }}</span>
                      }
                      @if (f.fields.length === 0) { <span class="text-muted">—</span> }
                    </div>
                  </td>
                  <td data-label="Envíos"><strong>{{ f.submissionCount }}</strong></td>
                  <td class="text-muted" data-label="Último envío">{{ formatDate(f.lastSubmissionAt) }}</td>
                  <td data-label="Estado">
                    <span class="badge" [class.badge-success]="f.active" [class.badge-neutral]="!f.active">
                      {{ f.active ? 'Activo' : 'Pausado' }}
                    </span>
                  </td>
                  <td class="td-actions">
                    <div class="row-actions">
                      <button class="btn btn-ghost btn-sm btn-icon" (click)="openEmbed(f)" title="Ver código de integración">
                        <lucide-icon [img]="Code2" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                      </button>
                      <button class="btn btn-ghost btn-sm btn-icon" (click)="openSubmissions(f)" title="Ver envíos">
                        <lucide-icon [img]="Inbox" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                      </button>
                      <button class="btn btn-ghost btn-sm btn-icon" (click)="openEditor(f)" title="Editar">
                        <lucide-icon [img]="Pencil" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                      </button>
                      <button class="btn btn-ghost btn-sm btn-icon danger" (click)="removeForm(f)" title="Eliminar">
                        <lucide-icon [img]="Trash2" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="table-footer">{{ forms().length }} formulario(s)</div>
      }
    </div>

    <!-- ── Editor (drawer) ── -->
    @if (editorOpen()) {
      <div class="overlay" (click)="closeEditor()" role="dialog" aria-modal="true" aria-label="Editor de formulario">
        <aside class="drawer" (click)="$event.stopPropagation()">

          <div class="drawer-header">
            <div class="drawer-title-group">
              <h2>{{ editing() ? 'Editar formulario' : 'Nuevo formulario' }}</h2>
              <p class="subtitle">Define los campos que verá el visitante y a dónde va cada dato.</p>
            </div>
            <button class="btn btn-ghost btn-icon" (click)="closeEditor()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>

          <div class="drawer-scroll">
            <form [formGroup]="form" (ngSubmit)="save()">

              <div class="field">
                <label class="field-label" for="form-name">Nombre *</label>
                <input id="form-name" class="input" formControlName="name" placeholder="Ej: Landing Black Friday" autofocus />
              </div>

              <div class="field">
                <label class="field-label" for="form-desc">Descripción</label>
                <input id="form-desc" class="input" formControlName="description" placeholder="Para qué sirve este formulario" />
              </div>

              <!-- Campos -->
              <div class="section-title">
                <span>Campos del formulario</span>
                <span class="section-hint">{{ fields().length }} campo(s)</span>
              </div>

              @if (fields().length === 0) {
                <p class="builder-empty">Añade campos rápidos o crea uno personalizado.</p>
              }

              <div class="builder">
                @for (f of fields(); track $index) {
                  <div class="field-card">
                    <div class="field-card-head">
                      <lucide-icon [img]="GripVertical" [size]="15" class="grip"></lucide-icon>
                      <input class="input input-sm field-label-input" [value]="f.label"
                        placeholder="Etiqueta visible"
                        (input)="setLabel($index, $any($event.target).value)" />
                      <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="$index === 0"
                        (click)="move($index, -1)" title="Subir">
                        <lucide-icon [img]="ArrowUp" [size]="14"></lucide-icon>
                      </button>
                      <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="$index === fields().length - 1"
                        (click)="move($index, 1)" title="Bajar">
                        <lucide-icon [img]="ArrowDown" [size]="14"></lucide-icon>
                      </button>
                      <button type="button" class="btn btn-ghost btn-sm btn-icon danger" (click)="removeField($index)" title="Quitar campo">
                        <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                      </button>
                    </div>

                    <div class="field-card-grid">
                      <div class="mini-field">
                        <label class="mini-label">Tipo</label>
                        <select class="select" [value]="f.type" (change)="setType($index, $any($event.target).value)">
                          @for (t of fieldTypes; track t.value) {
                            <option [value]="t.value">{{ t.label }}</option>
                          }
                        </select>
                      </div>
                      <div class="mini-field">
                        <label class="mini-label">Guardar en</label>
                        <select class="select" [value]="f.mapTo" (change)="setMapTo($index, $any($event.target).value)">
                          @for (m of mapTargets; track m.value) {
                            <option [value]="m.value">{{ m.label }}</option>
                          }
                        </select>
                      </div>
                      <div class="mini-field">
                        <label class="mini-label">Clave (name=)</label>
                        <input class="input input-sm" [value]="f.key" (input)="setKey($index, $any($event.target).value)" />
                      </div>
                      <div class="mini-field">
                        <label class="mini-label">Placeholder</label>
                        <input class="input input-sm" [value]="f.placeholder || ''"
                          (input)="setPlaceholder($index, $any($event.target).value)" />
                      </div>
                    </div>

                    @if (f.type === 'select') {
                      <div class="mini-field">
                        <label class="mini-label">Opciones (separadas por coma)</label>
                        <input class="input input-sm" [value]="f.options.join(', ')"
                          (input)="setOptions($index, $any($event.target).value)" />
                      </div>
                    }

                    <label class="check-row">
                      <input type="checkbox" [checked]="f.required" (change)="setRequired($index, $any($event.target).checked)" />
                      <span>Obligatorio</span>
                    </label>
                  </div>
                }
              </div>

              <div class="preset-row">
                @for (p of presetFields; track p.key) {
                  <button type="button" class="tag-chip" (click)="addPreset(p)" [disabled]="hasKey(p.key)">
                    <lucide-icon [img]="Plus" [size]="12"></lucide-icon>
                    {{ p.label }}
                  </button>
                }
                <button type="button" class="tag-chip" (click)="addCustomField()">
                  <lucide-icon [img]="Plus" [size]="12"></lucide-icon>
                  Campo personalizado
                </button>
              </div>

              <!-- Automatizaciones -->
              <div class="section-title"><span>Al recibir un contacto</span></div>

              <div class="field">
                <label class="field-label">Etiquetas a aplicar</label>
                <div class="custom-tag-row">
                  <input #tagInput class="input input-sm" placeholder="Ej: landing-bf"
                    (keydown.enter)="$event.preventDefault(); addTag(tagInput)" />
                  <button type="button" class="btn btn-ghost btn-sm" (click)="addTag(tagInput)">
                    <lucide-icon [img]="Plus" [size]="14"></lucide-icon>
                  </button>
                </div>
                @if (tags().length > 0) {
                  <div class="selected-tags">
                    @for (t of tags(); track t) {
                      <span class="badge badge-info tag-selected">
                        {{ t }}
                        <button type="button" (click)="removeTag(t)" aria-label="Quitar etiqueta">
                          <lucide-icon [img]="X" [size]="12"></lucide-icon>
                        </button>
                      </span>
                    }
                  </div>
                }
              </div>

              @if (lists().length > 0) {
                <div class="field">
                  <label class="field-label">Agregar a listas</label>
                  <div class="preset-tags">
                    @for (l of lists(); track l._id) {
                      <button type="button" class="tag-chip" [class.selected]="listIds().includes(l._id)"
                        (click)="toggleList(l._id)">
                        {{ l.name }}
                      </button>
                    }
                  </div>
                </div>
              }

              <div class="field">
                <label class="field-label" for="form-success">Mensaje de éxito</label>
                <input id="form-success" class="input" formControlName="successMessage" />
              </div>

              <div class="field">
                <label class="field-label" for="form-redirect">Redirigir a (opcional)</label>
                <input id="form-redirect" class="input" formControlName="redirectUrl" placeholder="https://tusitio.com/gracias" />
              </div>

              <label class="check-row">
                <input type="checkbox" [checked]="active()" (change)="active.set($any($event.target).checked)" />
                <span>Formulario activo (acepta envíos)</span>
              </label>

              @if (formError()) {
                <p class="form-error">{{ formError() }}</p>
              }

              <div class="drawer-actions">
                <button type="button" class="btn btn-secondary" (click)="closeEditor()">Cancelar</button>
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Guardando...' : 'Guardar formulario' }}
                </button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    }

    <!-- ── Código de integración ── -->
    @if (embedForm(); as ef) {
      <div class="overlay overlay-center" (click)="embedForm.set(null)" role="dialog" aria-modal="true" aria-label="Código de integración">
        <div class="modal-card modal-wide" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">Integrar «{{ ef.name }}»</h3>
              <p class="modal-sub">Pega este código en tu landing. Los contactos llegarán marcados con el origen de este formulario.</p>
            </div>
            <button class="btn btn-ghost btn-icon" (click)="embedForm.set(null)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>

          <div class="modal-body">
            <div class="tabs">
              @for (t of embedTabs; track t.id) {
                <button class="tab" [class.active]="embedTab() === t.id" (click)="embedTab.set(t.id)">{{ t.label }}</button>
              }
            </div>

            <div class="endpoint-row">
              <span class="method-pill">POST</span>
              <code class="endpoint">{{ submitUrl(ef) }}</code>
              <button class="btn btn-ghost btn-sm btn-icon" (click)="copy(submitUrl(ef), 'url')" title="Copiar URL">
                <lucide-icon [img]="copied() === 'url' ? Check : Copy" [size]="15"></lucide-icon>
              </button>
            </div>

            <pre class="code-block"><code>{{ snippet(ef) }}</code></pre>

            <div class="modal-actions">
              <button class="btn btn-secondary btn-sm" (click)="regenerate(ef)">
                <lucide-icon [img]="KeyRound" [size]="14"></lucide-icon>
                Regenerar clave
              </button>
              <button class="btn btn-primary btn-sm" (click)="copy(snippet(ef), 'code')">
                <lucide-icon [img]="copied() === 'code' ? Check : Copy" [size]="14"></lucide-icon>
                {{ copied() === 'code' ? 'Copiado' : 'Copiar código' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- ── Envíos ── -->
    @if (submissionsForm(); as sf) {
      <div class="overlay" (click)="submissionsForm.set(null)" role="dialog" aria-modal="true" aria-label="Envíos del formulario">
        <aside class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div class="drawer-title-group">
              <h2>Envíos</h2>
              <p class="subtitle">{{ sf.name }} · {{ submissions().length }} registro(s)</p>
            </div>
            <button class="btn btn-ghost btn-icon" (click)="submissionsForm.set(null)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>
          <div class="drawer-scroll">
            @if (loadingSubmissions()) {
              <div class="skeleton-list">
                @for (i of [1,2,3]; track i) { <div class="skeleton-row"></div> }
              </div>
            } @else if (submissions().length === 0) {
              <div class="empty-state">
                <div class="empty-icon"><lucide-icon [img]="Inbox" [size]="40" [strokeWidth]="1.5"></lucide-icon></div>
                <h3>Sin envíos todavía</h3>
                <p>En cuanto alguien complete el formulario aparecerá aquí y en Clientes.</p>
              </div>
            } @else {
              @for (s of submissions(); track s._id) {
                <div class="submission-card">
                  <div class="submission-head">
                    <span class="submission-date">{{ formatDateTime(s.createdAt) }}</span>
                    @if (s.pageUrl || s.referer) {
                      <a class="submission-origin" [href]="s.pageUrl || s.referer" target="_blank" rel="noopener">
                        <lucide-icon [img]="ExternalLink" [size]="12"></lucide-icon>
                        {{ shortUrl(s.pageUrl || s.referer) }}
                      </a>
                    }
                  </div>
                  <dl class="submission-data">
                    @for (entry of entries(s.data); track entry[0]) {
                      <div class="data-row">
                        <dt>{{ entry[0] }}</dt>
                        <dd>{{ entry[1] }}</dd>
                      </div>
                    }
                  </dl>
                </div>
              }
            }
          </div>
        </aside>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; gap:16px; flex-wrap:wrap; }
    .page-header h1 { font-size:24px; font-weight:700; margin:0 0 4px; font-family:var(--font-heading); }
    .subtitle { color:var(--color-text-muted); margin:0; font-size:14px; max-width:640px; }
    .header-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }

    .stats-row { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin-bottom:24px; }
    .stat-card { background:#fff; border:1px solid var(--color-border); border-radius:16px; padding:20px 24px; display:flex; flex-direction:column; gap:4px; }
    .stat-value { font-size:28px; font-weight:800; color:var(--color-text-main); letter-spacing:-1px; font-family:var(--font-heading); }
    .stat-label { font-size:13px; color:var(--color-text-muted); font-weight:500; }

    .table-wrap { background:#fff; border:1px solid var(--color-border); border-radius:16px; overflow:hidden; }
    .table-wrap table { width:100%; border-collapse:collapse; }
    .table-wrap th { padding:13px 16px; text-align:left; font-size:12px; font-weight:700; color:var(--color-text-muted); text-transform:uppercase; letter-spacing:.05em; background:var(--color-bg-app); border-bottom:1px solid var(--color-border); }
    .table-wrap td { padding:14px 16px; border-bottom:1px solid var(--color-border); font-size:14px; vertical-align:middle; }
    .table-wrap tr:last-child td { border-bottom:none; }
    .table-wrap tr:hover td { background:var(--color-bg-app); }
    .text-muted { color:var(--color-text-muted); }
    .table-footer { padding:12px 20px; font-size:13px; color:var(--color-text-muted); background:var(--color-bg-app); border:1px solid var(--color-border); border-top:none; border-radius:0 0 16px 16px; }

    .form-cell { display:flex; align-items:center; gap:12px; }
    .form-icon { width:38px; height:38px; min-width:38px; border-radius:12px; background:var(--color-brand-light); color:var(--color-brand); display:flex; align-items:center; justify-content:center; }
    .form-info { display:flex; flex-direction:column; gap:2px; }
    .form-name { font-weight:600; color:var(--color-text-main); }
    .form-desc { font-size:12px; color:var(--color-text-muted); }

    .tags-cell { display:flex; gap:4px; flex-wrap:wrap; max-width:260px; }
    .tag-badge { font-size:11px; }
    .row-actions { display:flex; gap:4px; }
    .btn.danger { color:var(--color-error); }
    .btn.danger:hover { background:#FEF2F2; }

    .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 40px; gap:16px; text-align:center; }
    .empty-state h3 { margin:0; font-size:18px; font-weight:700; }
    .empty-state p { margin:0; color:var(--color-text-muted); max-width:380px; line-height:1.5; }
    .empty-icon { color:var(--color-brand); opacity:.3; }

    /* ── Overlays ── */
    .overlay { position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px); display:flex; align-items:stretch; justify-content:flex-end; z-index:100; }
    .overlay-center { align-items:center; justify-content:center; }
    .drawer { width:640px; background:#fff; box-shadow:-10px 0 40px rgba(0,0,0,.15); display:flex; flex-direction:column; height:100vh; animation:slideInRight .25s var(--transition-spring); }
    @keyframes slideInRight { from{transform:translateX(100%)} to{transform:translateX(0)} }
    .drawer-header { padding:32px 32px 20px; display:flex; align-items:flex-start; justify-content:space-between; gap:16px; border-bottom:1px solid var(--color-border); flex-shrink:0; }
    .drawer-title-group h2 { margin:0 0 4px; font-size:24px; font-weight:800; letter-spacing:-.5px; }
    .drawer-scroll { padding:32px; overflow-y:auto; flex:1; }
    .drawer-actions { display:flex; gap:12px; justify-content:flex-end; padding-top:24px; border-top:1px solid var(--color-border); margin-top:8px; }

    .field { display:flex; flex-direction:column; gap:8px; margin-bottom:24px; }
    .field-label { font-size:14px; font-weight:600; color:var(--color-text-main); }
    .input-sm { padding:8px 14px; font-size:13px; }

    .section-title { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin:32px 0 12px; padding-bottom:8px; border-bottom:1px solid var(--color-border); }
    .section-title span:first-child { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--color-text-muted); }
    .section-hint { font-size:12px; color:var(--color-text-muted); }

    /* ── Constructor de campos ── */
    .builder { display:flex; flex-direction:column; gap:12px; }
    .builder-empty { font-size:13px; color:var(--color-text-muted); margin:0 0 12px; }
    .field-card { border:1px solid var(--color-border); border-radius:var(--radius-lg); padding:16px; background:var(--color-bg-app); display:flex; flex-direction:column; gap:12px; }
    .field-card-head { display:flex; align-items:center; gap:6px; }
    .grip { color:var(--color-text-muted); flex-shrink:0; }
    .field-label-input { flex:1; font-weight:600; }
    .field-card-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .mini-field { display:flex; flex-direction:column; gap:5px; }
    .mini-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--color-text-muted); }
    .field-card .select { padding:8px 14px; font-size:13px; }
    .check-row { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:var(--color-text-main); cursor:pointer; }
    .check-row input { width:16px; height:16px; accent-color:var(--color-brand); cursor:pointer; }

    .preset-row { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
    .preset-tags { display:flex; flex-wrap:wrap; gap:8px; }
    .tag-chip { display:inline-flex; align-items:center; gap:5px; padding:6px 14px; border-radius:var(--radius-pill); border:1.5px solid var(--color-border); background:#fff; font-size:13px; font-weight:600; color:var(--color-text-muted); cursor:pointer; transition:all .2s; }
    .tag-chip:hover:not(:disabled) { border-color:var(--color-brand); color:var(--color-brand); }
    .tag-chip.selected { background:var(--color-brand); border-color:var(--color-brand); color:#fff; }
    .tag-chip:disabled { opacity:.45; cursor:not-allowed; }

    .custom-tag-row { display:flex; gap:8px; align-items:center; }
    .selected-tags { display:flex; flex-wrap:wrap; gap:6px; padding:12px; background:var(--color-bg-app); border-radius:12px; border:1px solid var(--color-border); margin-top:8px; }
    .tag-selected { display:inline-flex; align-items:center; gap:6px; }
    .tag-selected button { background:none; border:none; cursor:pointer; padding:0; display:flex; color:inherit; opacity:.7; }
    .tag-selected button:hover { opacity:1; }

    .form-error { color:var(--color-error); font-size:13px; font-weight:600; margin:16px 0 0; }

    /* ── Modal de integración ── */
    .modal-card { background:var(--color-white); border-radius:var(--radius-lg); width:calc(100% - 48px); max-width:480px; box-shadow:var(--shadow-lg); animation:fadeUp .2s ease; overflow:hidden; }
    .modal-wide { max-width:720px; }
    @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    .modal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:24px 32px 16px; border-bottom:1px solid var(--color-border); }
    .modal-title { font-family:var(--font-heading); font-size:17px; font-weight:700; margin:0 0 4px; }
    .modal-sub { font-size:12px; color:var(--color-text-muted); margin:0; max-width:520px; line-height:1.5; }
    .modal-body { padding:20px 32px 28px; }

    .tabs { display:flex; gap:6px; margin-bottom:16px; }
    .tab { padding:7px 16px; border-radius:var(--radius-pill); border:1px solid var(--color-border); background:#fff; font-size:13px; font-weight:600; color:var(--color-text-muted); cursor:pointer; transition:all .2s; }
    .tab:hover { border-color:var(--color-brand); color:var(--color-brand); }
    .tab.active { background:var(--color-brand); border-color:var(--color-brand); color:#fff; }

    .endpoint-row { display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--color-bg-app); border:1px solid var(--color-border); border-radius:var(--radius-lg); margin-bottom:14px; }
    .method-pill { font-size:11px; font-weight:800; letter-spacing:.05em; color:#fff; background:var(--color-brand); border-radius:var(--radius-pill); padding:3px 10px; flex-shrink:0; }
    .endpoint { flex:1; font-size:12px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--color-text-main); overflow-x:auto; white-space:nowrap; }

    .code-block { margin:0; background:#0F172A; color:#E2E8F0; border-radius:var(--radius-lg); padding:18px 20px; font-size:12px; line-height:1.65; overflow-x:auto; max-height:340px; }
    .code-block code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; white-space:pre; }

    .modal-actions { display:flex; justify-content:space-between; gap:12px; margin-top:18px; }

    /* ── Envíos ── */
    .submission-card { border:1px solid var(--color-border); border-radius:var(--radius-lg); padding:16px 20px; margin-bottom:12px; background:#fff; }
    .submission-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
    .submission-date { font-size:12px; font-weight:700; color:var(--color-text-muted); }
    .submission-origin { display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--color-brand); text-decoration:none; font-weight:600; }
    .submission-origin:hover { text-decoration:underline; }
    .submission-data { margin:0; display:flex; flex-direction:column; gap:6px; }
    .data-row { display:flex; gap:12px; font-size:13px; }
    .data-row dt { min-width:120px; color:var(--color-text-muted); font-weight:600; }
    .data-row dd { margin:0; color:var(--color-text-main); word-break:break-word; }

    .skeleton-list { padding:16px; display:flex; flex-direction:column; gap:12px; }
    .skeleton-row { height:52px; border-radius:12px; background:linear-gradient(90deg,var(--color-bg-app) 25%,#EEF2F7 50%,var(--color-bg-app) 75%); background-size:200% 100%; animation:shimmer 1.3s infinite; }
    @keyframes shimmer { from{background-position:200% 0} to{background-position:-200% 0} }

    @media (max-width: 1024px) {
      .stats-row { grid-template-columns:repeat(3, 1fr); }
    }

    @media (max-width: 768px) {
      .page { padding:20px 16px; }
      .stats-row { grid-template-columns:1fr; }
      .drawer { width:100%; }
      .drawer-header { padding:20px 20px 16px; }
      .drawer-scroll { padding:20px; }
      .field-card-grid { grid-template-columns:1fr; }
      .modal-header, .modal-body { padding-left:20px; padding-right:20px; }
      .modal-actions { flex-direction:column-reverse; }
      .modal-actions .btn { width:100%; justify-content:center; }

      .table-wrap table, .table-wrap thead, .table-wrap tbody,
      .table-wrap tr, .table-wrap th, .table-wrap td { display:block; }
      .table-wrap thead { display:none; }
      .table-wrap tr { border-bottom:1px solid var(--color-border); padding:12px 4px; }
      .table-wrap td { border:none; padding:6px 16px; display:flex; justify-content:space-between; gap:12px; }
      .table-wrap td[data-label]::before { content:attr(data-label); font-size:11px; font-weight:700; text-transform:uppercase; color:var(--color-text-muted); }
      .td-actions { justify-content:flex-end !important; }
    }
  `],
})
export class FormsComponent implements OnInit {
  private api = inject(FormsApiService);
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Plus = Plus;
  readonly Pencil = Pencil;
  readonly Trash2 = Trash2;
  readonly X = X;
  readonly Code2 = Code2;
  readonly Copy = Copy;
  readonly Check = Check;
  readonly Inbox = Inbox;
  readonly FileText = FileText;
  readonly RefreshCw = RefreshCw;
  readonly KeyRound = KeyRound;
  readonly GripVertical = GripVertical;
  readonly ArrowUp = ArrowUp;
  readonly ArrowDown = ArrowDown;
  readonly ExternalLink = ExternalLink;

  readonly fieldTypes = FIELD_TYPES;
  readonly mapTargets = MAP_TARGETS;
  readonly presetFields = PRESET_FIELDS;
  readonly embedTabs = [
    { id: 'html' as const, label: 'HTML + JS' },
    { id: 'js' as const, label: 'Solo JavaScript' },
    { id: 'curl' as const, label: 'API REST' },
  ];

  forms = signal<ContactForm[]>([]);
  lists = signal<ListMini[]>([]);
  loading = signal(true);

  editorOpen = signal(false);
  editing = signal<ContactForm | null>(null);
  saving = signal(false);
  formError = signal('');
  fields = signal<FormField[]>([]);
  tags = signal<string[]>([]);
  listIds = signal<string[]>([]);
  active = signal(true);

  embedForm = signal<ContactForm | null>(null);
  embedTab = signal<'html' | 'js' | 'curl'>('html');
  copied = signal<'url' | 'code' | ''>('');

  submissionsForm = signal<ContactForm | null>(null);
  submissions = signal<FormSubmission[]>([]);
  loadingSubmissions = signal(false);

  form = this.fb.group({
    name: ['', Validators.required],
    description: [''],
    successMessage: ['¡Gracias! Hemos recibido tus datos.'],
    redirectUrl: [''],
  });

  activeCount = computed(() => this.forms().filter((f) => f.active).length);
  totalSubmissions = computed(() =>
    this.forms().reduce((sum, f) => sum + (f.submissionCount || 0), 0),
  );

  ngOnInit() {
    this.load();
    this.http.get<ListMini[]>(`${API}/lists`).subscribe({
      next: (ls) => this.lists.set(ls.filter((l) => l.type === 'static')),
      error: () => this.lists.set([]),
    });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.embedForm()) return this.embedForm.set(null);
    if (this.submissionsForm()) return this.submissionsForm.set(null);
    if (this.editorOpen()) this.closeEditor();
  }

  private load() {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (fs) => {
        this.forms.set(fs);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error(err.error?.message || 'No se pudieron cargar los formularios');
      },
    });
  }

  // ─── Editor ───────────────────────────────────────────────────────────────

  openEditor(f: ContactForm | null) {
    this.editing.set(f);
    this.formError.set('');
    this.form.reset({
      name: f?.name ?? '',
      description: f?.description ?? '',
      successMessage: f?.successMessage ?? '¡Gracias! Hemos recibido tus datos.',
      redirectUrl: f?.redirectUrl ?? '',
    });
    this.fields.set(f ? f.fields.map((x) => ({ ...x, options: [...x.options] })) : PRESET_FIELDS.slice(0, 2).map((x) => ({ ...x })));
    this.tags.set([...(f?.tags ?? [])]);
    this.listIds.set([...(f?.listIds ?? [])]);
    this.active.set(f?.active ?? true);
    this.editorOpen.set(true);
  }

  closeEditor() {
    this.editorOpen.set(false);
    this.editing.set(null);
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('El nombre es obligatorio');
      return;
    }
    const fields = this.fields();
    if (fields.length === 0) {
      this.formError.set('Añade al menos un campo');
      this.toast.error('Añade al menos un campo al formulario');
      return;
    }
    if (fields.some((f) => !f.key.trim() || !f.label.trim())) {
      this.formError.set('Todos los campos necesitan etiqueta y clave');
      this.toast.error('Todos los campos necesitan etiqueta y clave');
      return;
    }
    const keys = fields.map((f) => f.key.trim());
    if (new Set(keys).size !== keys.length) {
      this.formError.set('Hay claves repetidas entre los campos');
      this.toast.error('Hay claves repetidas entre los campos');
      return;
    }
    // Sin email ni teléfono no hay forma de identificar al contacto.
    if (!fields.some((f) => f.mapTo === 'email' || f.mapTo === 'phone')) {
      this.formError.set('El formulario debe capturar un email o un teléfono');
      this.toast.error('El formulario debe capturar un email o un teléfono');
      return;
    }

    const v = this.form.getRawValue();
    const payload: FormPayload = {
      name: v.name!.trim(),
      description: v.description?.trim() || undefined,
      fields,
      tags: this.tags(),
      listIds: this.listIds(),
      active: this.active(),
      successMessage: v.successMessage?.trim() || '¡Gracias! Hemos recibido tus datos.',
      redirectUrl: v.redirectUrl?.trim() || undefined,
    };

    this.saving.set(true);
    this.formError.set('');
    const current = this.editing();
    const req = current
      ? this.api.update(current._id, payload)
      : this.api.create(payload);

    req.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.toast.success(current ? 'Formulario actualizado' : 'Formulario creado');
        this.closeEditor();
        this.load();
        if (!current) this.embedForm.set(saved);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err.error?.message || 'No se pudo guardar el formulario';
        this.formError.set(Array.isArray(msg) ? msg.join(', ') : msg);
        this.toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
      },
    });
  }

  async removeForm(f: ContactForm) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar formulario',
      message: `Se eliminará «${f.name}» y su historial de envíos. Las landings que lo usen dejarán de enviar contactos. Los contactos ya capturados se conservan.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.remove(f._id).subscribe({
      next: () => {
        this.toast.success('Formulario eliminado');
        this.load();
      },
      error: (err) => this.toast.error(err.error?.message || 'No se pudo eliminar'),
    });
  }

  // ─── Constructor de campos ────────────────────────────────────────────────

  private patchField(index: number, patch: Partial<FormField>) {
    this.fields.update((fs) =>
      fs.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  }

  setLabel(i: number, label: string) {
    const current = this.fields()[i];
    // La clave sigue a la etiqueta solo mientras no se haya tocado a mano.
    const autoKey = this.slug(current.label) === current.key;
    this.patchField(i, { label, ...(autoKey ? { key: this.slug(label) } : {}) });
  }

  setKey(i: number, key: string) {
    this.patchField(i, { key: this.slug(key) });
  }

  setType(i: number, type: string) {
    this.patchField(i, { type: type as FormFieldType });
  }

  setMapTo(i: number, mapTo: string) {
    this.patchField(i, { mapTo: mapTo as FormFieldMapTo });
  }

  setPlaceholder(i: number, placeholder: string) {
    this.patchField(i, { placeholder });
  }

  setRequired(i: number, required: boolean) {
    this.patchField(i, { required });
  }

  setOptions(i: number, raw: string) {
    this.patchField(i, {
      options: raw.split(',').map((o) => o.trim()).filter(Boolean),
    });
  }

  removeField(i: number) {
    this.fields.update((fs) => fs.filter((_, idx) => idx !== i));
  }

  move(i: number, delta: number) {
    const target = i + delta;
    this.fields.update((fs) => {
      if (target < 0 || target >= fs.length) return fs;
      const next = [...fs];
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  }

  addPreset(p: FormField) {
    if (this.hasKey(p.key)) return;
    this.fields.update((fs) => [...fs, { ...p, options: [] }]);
  }

  addCustomField() {
    const key = this.uniqueKey('campo');
    this.fields.update((fs) => [
      ...fs,
      { key, label: '', type: 'text', placeholder: '', required: false, options: [], mapTo: '' },
    ]);
  }

  hasKey(key: string): boolean {
    return this.fields().some((f) => f.key === key);
  }

  private uniqueKey(base: string): string {
    let key = base;
    let n = 2;
    while (this.hasKey(key)) key = `${base}-${n++}`;
    return key;
  }

  private slug(v: string): string {
    return v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ─── Tags y listas ────────────────────────────────────────────────────────

  addTag(input: HTMLInputElement) {
    const value = input.value.trim();
    if (!value) return;
    if (!this.tags().includes(value)) this.tags.update((t) => [...t, value]);
    input.value = '';
  }

  removeTag(tag: string) {
    this.tags.update((t) => t.filter((x) => x !== tag));
  }

  toggleList(id: string) {
    this.listIds.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  // ─── Integración ──────────────────────────────────────────────────────────

  openEmbed(f: ContactForm) {
    this.embedTab.set('html');
    this.copied.set('');
    this.embedForm.set(f);
  }

  submitUrl(f: ContactForm): string {
    return `${this.api.publicBase}/${f.publicKey}/submit`;
  }

  snippet(f: ContactForm): string {
    if (this.embedTab() === 'curl') return this.curlSnippet(f);
    if (this.embedTab() === 'js') return this.jsSnippet(f);
    return `${this.htmlFields(f)}\n${this.jsSnippet(f)}`;
  }

  private formId(f: ContactForm): string {
    return `maya-form-${f.publicKey.slice(0, 8)}`;
  }

  private htmlFields(f: ContactForm): string {
    const inputs = f.fields
      .map((field) => {
        const req = field.required ? ' required' : '';
        const ph = field.placeholder ? ` placeholder="${field.placeholder}"` : '';
        if (field.type === 'textarea')
          return `  <label>${field.label}</label>\n  <textarea name="${field.key}"${ph}${req}></textarea>`;
        if (field.type === 'select') {
          const opts = field.options
            .map((o) => `    <option value="${o}">${o}</option>`)
            .join('\n');
          return `  <label>${field.label}</label>\n  <select name="${field.key}"${req}>\n${opts}\n  </select>`;
        }
        if (field.type === 'checkbox')
          return `  <label><input type="checkbox" name="${field.key}" value="si"${req} /> ${field.label}</label>`;
        return `  <label>${field.label}</label>\n  <input type="${field.type}" name="${field.key}"${ph}${req} />`;
      })
      .join('\n');
    return `<form id="${this.formId(f)}">\n${inputs}\n  <button type="submit">Enviar</button>\n</form>`;
  }

  private jsSnippet(f: ContactForm): string {
    return `<script>
(function () {
  var form = document.getElementById('${this.formId(f)}');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {};
    new FormData(form).forEach(function (value, key) { data[key] = value; });
    fetch('${this.submitUrl(f)}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: data, pageUrl: location.href })
    })
      .then(function (r) {
        return r.json().then(function (res) { return { ok: r.ok, res: res }; });
      })
      .then(function (out) {
        // Sin comprobar r.ok, un 400 se mostraba como si fuera un envío correcto.
        if (!out.ok) {
          var msg = out.res && out.res.message;
          alert(Array.isArray(msg) ? msg.join('\n') : (msg || 'No se pudo enviar. Revisa los datos.'));
          return;
        }
        if (out.res.redirectUrl) { location.href = out.res.redirectUrl; return; }
        form.reset();
        alert(out.res.message || '¡Gracias!');
      })
      .catch(function () { alert('No se pudo enviar. Inténtalo de nuevo.'); });
  });
})();
<\/script>`;
  }

  private curlSnippet(f: ContactForm): string {
    const body = f.fields.reduce<Record<string, string>>((acc, field) => {
      acc[field.key] = field.placeholder || `<${field.label}>`;
      return acc;
    }, {});
    return `# Enviar un contacto desde tu backend o cualquier cliente HTTP
curl -X POST '${this.submitUrl(f)}' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify({ data: body, pageUrl: 'https://tusitio.com/landing' })}'

# Respuesta
# { "ok": true, "message": "${f.successMessage}", "customerId": "...", "created": true }

# Definición del formulario (para renderizarlo dinámicamente)
curl '${this.api.publicBase}/${f.publicKey}'`;
  }

  copy(text: string, kind: 'url' | 'code') {
    navigator.clipboard.writeText(text).then(
      () => {
        this.copied.set(kind);
        this.toast.success('Copiado al portapapeles');
        setTimeout(() => this.copied.set(''), 2000);
      },
      () => this.toast.error('No se pudo copiar'),
    );
  }

  async regenerate(f: ContactForm) {
    const ok = await this.confirm.confirm({
      title: 'Regenerar clave pública',
      message: 'La clave actual dejará de funcionar al instante. Tendrás que actualizar el código en todas las landings donde esté publicado.',
      confirmText: 'Regenerar',
      danger: true,
    });
    if (!ok) return;
    this.api.regenerateKey(f._id).subscribe({
      next: (updated) => {
        this.embedForm.set(updated);
        this.toast.success('Clave regenerada');
        this.load();
      },
      error: (err) => this.toast.error(err.error?.message || 'No se pudo regenerar'),
    });
  }

  // ─── Envíos ───────────────────────────────────────────────────────────────

  openSubmissions(f: ContactForm) {
    this.submissionsForm.set(f);
    this.submissions.set([]);
    this.loadingSubmissions.set(true);
    this.api.submissions(f._id).subscribe({
      next: (s) => {
        this.submissions.set(s);
        this.loadingSubmissions.set(false);
      },
      error: (err) => {
        this.loadingSubmissions.set(false);
        this.toast.error(err.error?.message || 'No se pudieron cargar los envíos');
      },
    });
  }

  entries(data: Record<string, unknown>): [string, string][] {
    return Object.entries(data).map(([k, v]) => [k, String(v)]);
  }

  shortUrl(url?: string): string {
    if (!url) return '';
    return url.replace(/^https?:\/\//, '').slice(0, 42);
  }

  formatDate(iso?: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('es-PE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
