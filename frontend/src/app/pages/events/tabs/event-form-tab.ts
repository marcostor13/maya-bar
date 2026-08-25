import { Component, inject, signal } from '@angular/core';
import {
  LucideAngularModule,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  GripVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { ConfirmService } from '../../../shared/confirm';
import { FormField, FormFieldType } from '../../../shared/models/event.model';
import { EventDetailStore } from '../event-detail.store';

const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text:     'Texto',
  textarea: 'Párrafo',
  select:   'Selección',
  checkbox: 'Sí / No',
  number:   'Número',
  email:    'Email',
  phone:    'Teléfono',
  date:     'Fecha',
};

@Component({
  selector: 'app-event-form-tab',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="p-6 animate-fade-in">
      <div class="form-builder-header">
        <div>
          <h3 class="section-h3">Constructor de Formulario</h3>
          <p class="text-muted-sm">Define qué información adicional solicitar a los asistentes al registrarse.</p>
        </div>
      </div>

      <!-- Default fields (always present, not editable) -->
      <div class="default-fields-box">
        <h4 class="default-fields-title">Campos incluidos siempre</h4>
        <div class="default-field-list">
          <div class="default-field-item">
            <span class="field-type-chip chip-text">Texto</span>
            <span>Nombre completo</span>
            <span class="badge badge-neutral locked-badge">Obligatorio</span>
          </div>
          <div class="default-field-item">
            <span class="field-type-chip chip-email">Email</span>
            <span>Correo electrónico</span>
            <span class="badge badge-neutral locked-badge">Obligatorio</span>
          </div>
          <div class="default-field-item">
            <span class="field-type-chip chip-phone">Teléfono</span>
            <span>Número de teléfono</span>
            <span class="text-muted-xs">Opcional</span>
          </div>
        </div>
      </div>

      <!-- Custom fields -->
      <div class="custom-fields-section">
        <div class="custom-fields-header">
          <h4 class="section-sub-title">Campos adicionales</h4>
          @if (editingFieldId() === null) {
            <button class="btn btn-sm btn-secondary" (click)="startAddField()">
              <lucide-icon [img]="Plus" [size]="14"></lucide-icon>
              Agregar pregunta
            </button>
          }
        </div>

        @if (formFields().length === 0 && editingFieldId() === null) {
          <div class="empty-fields-state">
            <lucide-icon [img]="ClipboardList" [size]="40" [strokeWidth]="1.5"></lucide-icon>
            <p>Sin campos adicionales. Agrega preguntas personalizadas para tu evento.</p>
          </div>
        }

        <div class="field-items-list">
          @for (field of formFields(); track field.id; let i = $index; let last = $last) {
            @if (editingFieldId() === field.id) {
              <!-- Edit inline -->
              <div class="field-edit-card">
                <div class="field-edit-row">
                  <div class="field flex-1">
                    <label class="field-label">Pregunta</label>
                    <input class="input" [value]="editDraft.label"
                      (input)="editDraft.label = $any($event.target).value"
                      placeholder="Ej: ¿Tienes alguna restricción alimentaria?" autofocus />
                  </div>
                  <div class="field" style="width:160px">
                    <label class="field-label">Tipo</label>
                    <select class="input" [value]="editDraft.type"
                      (change)="editDraft.type = $any($event.target).value">
                      <option value="text">Texto corto</option>
                      <option value="textarea">Texto largo</option>
                      <option value="select">Selección</option>
                      <option value="checkbox">Sí / No</option>
                      <option value="number">Número</option>
                      <option value="email">Email</option>
                      <option value="phone">Teléfono</option>
                      <option value="date">Fecha</option>
                    </select>
                  </div>
                </div>
                @if (editDraft.type === 'select') {
                  <div class="field mt-3">
                    <label class="field-label">Opciones (separadas por coma)</label>
                    <input class="input" [value]="editDraft.optionsStr"
                      (input)="editDraft.optionsStr = $any($event.target).value"
                      placeholder="Ej: Vegano, Sin gluten, Normal" />
                  </div>
                }
                <div class="field-edit-footer">
                  <label class="required-toggle">
                    <input type="checkbox" [checked]="editDraft.required"
                      (change)="editDraft.required = $any($event.target).checked" />
                    <span>Campo obligatorio</span>
                  </label>
                  <div class="flex gap-2">
                    <button class="btn btn-sm btn-ghost" (click)="cancelEdit()">Cancelar</button>
                    <button class="btn btn-sm btn-primary" (click)="saveFieldEdit()">
                      <lucide-icon [img]="Check" [size]="14"></lucide-icon>
                      Guardar
                    </button>
                  </div>
                </div>
              </div>
            } @else {
              <div class="field-item-row">
                <lucide-icon [img]="GripVertical" [size]="16" class="drag-handle"></lucide-icon>
                <span class="field-type-chip {{ chipClass(field.type) }}">{{ fieldTypeLabel(field.type) }}</span>
                <span class="field-item-label">{{ field.label }}</span>
                @if (field.required) {
                  <span class="badge badge-neutral" style="font-size:11px;padding:2px 8px;">Obligatorio</span>
                }
                @if (field.type === 'select' && field.options.length) {
                  <span class="options-preview">{{ field.options.join(' / ') }}</span>
                }
                <div class="field-item-actions">
                  <button class="btn-icon-xs" (click)="moveUp(field)" [disabled]="i === 0" title="Subir">
                    <lucide-icon [img]="ChevronUp" [size]="14"></lucide-icon>
                  </button>
                  <button class="btn-icon-xs" (click)="moveDown(field)" [disabled]="last" title="Bajar">
                    <lucide-icon [img]="ChevronDown" [size]="14"></lucide-icon>
                  </button>
                  <button class="btn-icon-xs" (click)="editField(field)" title="Editar">
                    <lucide-icon [img]="Pencil" [size]="14"></lucide-icon>
                  </button>
                  <button class="btn-icon-xs danger" (click)="deleteField(field)" title="Eliminar">
                    <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                  </button>
                </div>
              </div>
            }
          }

          <!-- New field form -->
          @if (editingFieldId() === 'NEW') {
            <div class="field-edit-card">
              <div class="field-edit-row">
                <div class="field flex-1">
                  <label class="field-label">Pregunta</label>
                  <input class="input" [value]="editDraft.label"
                    (input)="editDraft.label = $any($event.target).value"
                    placeholder="Ej: ¿Tienes alguna restricción alimentaria?" autofocus />
                </div>
                <div class="field" style="width:160px">
                  <label class="field-label">Tipo</label>
                  <select class="input" [value]="editDraft.type"
                    (change)="editDraft.type = $any($event.target).value">
                    <option value="text">Texto corto</option>
                    <option value="textarea">Texto largo</option>
                    <option value="select">Selección</option>
                    <option value="checkbox">Sí / No</option>
                    <option value="number">Número</option>
                    <option value="email">Email</option>
                    <option value="phone">Teléfono</option>
                    <option value="date">Fecha</option>
                  </select>
                </div>
              </div>
              @if (editDraft.type === 'select') {
                <div class="field mt-3">
                  <label class="field-label">Opciones (separadas por coma)</label>
                  <input class="input" [value]="editDraft.optionsStr"
                    (input)="editDraft.optionsStr = $any($event.target).value"
                    placeholder="Ej: Vegano, Sin gluten, Normal" />
                </div>
              }
              <div class="field-edit-footer">
                <label class="required-toggle">
                  <input type="checkbox" [checked]="editDraft.required"
                    (change)="editDraft.required = $any($event.target).checked" />
                  <span>Campo obligatorio</span>
                </label>
                <div class="flex gap-2">
                  <button class="btn btn-sm btn-ghost" (click)="cancelEdit()">Cancelar</button>
                  <button class="btn btn-sm btn-primary" (click)="saveFieldEdit()">
                    <lucide-icon [img]="Check" [size]="14"></lucide-icon>
                    Agregar campo
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      </div>

      @if (!isNew()) {
        <div class="media-save-hint mt-4">
          <lucide-icon [img]="Save" [size]="14"></lucide-icon>
          Los cambios en el formulario se guardan al actualizar el evento desde la pestaña General.
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .p-6 { padding: 24px; }
    .mt-3 { margin-top: 12px; } .mt-4 { margin-top: 16px; }
    .flex { display: flex; } .flex-1 { flex: 1; }
    .gap-2 { gap: 8px; }
    .text-muted-sm { font-size: 14px; color: var(--color-text-muted); margin: 4px 0 0; line-height: 1.5; }
    .text-muted-xs { font-size: 12px; color: var(--color-text-muted); }

    .section-h3 { margin: 0; font-size: 17px; font-weight: 700; font-family: var(--font-heading); }

    /* ── Fields ── */
    .field { display: flex; flex-direction: column; gap: 8px; }
    .field-label { font-size: 14px; font-weight: 600; color: var(--color-text-main); }

    /* ── Form Builder tab ── */
    .form-builder-header { margin-bottom: 24px; }
    .default-fields-box { background: var(--color-bg-app); border: 1px solid var(--color-border); border-radius: 14px; padding: 16px 20px; margin-bottom: 24px; }
    .default-fields-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); margin: 0 0 12px; }
    .default-field-list { display: flex; flex-direction: column; gap: 8px; }
    .default-field-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--color-border); }
    .default-field-item:last-child { border-bottom: none; }
    .locked-badge { opacity: 0.7; font-size: 11px; padding: 2px 8px; }
    .custom-fields-section { }
    .custom-fields-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .section-sub-title { font-size: 14px; font-weight: 700; color: var(--color-text-main); margin: 0; }
    .empty-fields-state { padding: 48px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--color-text-muted); background: var(--color-bg-app); border: 2px dashed var(--color-border); border-radius: 14px; }
    .field-items-list { display: flex; flex-direction: column; gap: 8px; }
    .field-item-row { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: #fff; border: 1px solid var(--color-border); border-radius: 12px; transition: box-shadow 0.2s; }
    .field-item-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .drag-handle { color: var(--color-text-muted); cursor: grab; opacity: 0.4; flex-shrink: 0; }
    .field-item-label { flex: 1; font-size: 14px; font-weight: 600; color: var(--color-text-main); }
    .options-preview { font-size: 12px; color: var(--color-text-muted); background: var(--color-bg-app); padding: 2px 8px; border-radius: 6px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .field-item-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; flex-shrink: 0; }
    .field-edit-card { background: var(--color-brand-light); border: 1px solid rgba(225,29,72,0.2); border-radius: 14px; padding: 20px; }
    .field-edit-row { display: flex; gap: 16px; align-items: flex-start; }
    .field-edit-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(225,29,72,0.15); }
    .required-toggle { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; cursor: pointer; }
    .required-toggle input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; }

    /* ── Field type chips ── */
    .field-type-chip { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.04em; flex-shrink: 0; }
    .chip-text { background: #f0fdf4; color: #16a34a; }
    .chip-email { background: #eff6ff; color: #2563eb; }
    .chip-phone { background: #fff7ed; color: #d97706; }
    .chip-number { background: #faf5ff; color: #7c3aed; }
    .chip-textarea { background: #f0f9ff; color: #0284c7; }
    .chip-select { background: #fff1f2; color: var(--color-brand); }
    .chip-checkbox { background: #f8fafc; color: #64748b; }
    .chip-date { background: #fefce8; color: #ca8a04; }

    /* ── Btn icon xs ── */
    .btn-icon-xs { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: none; background: none; border-radius: 8px; cursor: pointer; color: var(--color-text-muted); transition: all 0.15s; }
    .btn-icon-xs:hover:not(:disabled) { background: var(--color-bg-app); color: var(--color-text-main); }
    .btn-icon-xs.danger:hover:not(:disabled) { background: #fee2e2; color: var(--color-error); }
    .btn-icon-xs:disabled { opacity: 0.3; cursor: not-allowed; }

    .media-save-hint { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-text-muted); padding: 12px 16px; background: var(--color-bg-app); border-radius: 10px; border: 1px solid var(--color-border); margin-top: 20px; }

    @media (max-width: 768px) {
      .p-6 { padding: 16px; }

      .form-builder-header, .custom-fields-header { flex-wrap: wrap; gap: 10px; }
      .custom-fields-header .btn { width: 100%; justify-content: center; }
      .default-field-item { flex-wrap: wrap; }

      .field-edit-row { flex-direction: column; gap: 12px; align-items: stretch; }
      .field-edit-row .field { width: 100% !important; }
      .field-edit-footer { flex-direction: column; align-items: stretch; gap: 12px; }
      .field-edit-footer .flex { justify-content: stretch; }
      .field-edit-footer .btn { flex: 1; justify-content: center; }

      .field-item-row { flex-wrap: wrap; }
      .field-item-actions { margin-left: 0; width: 100%; justify-content: flex-end; }
    }
  `],
})
export class EventFormTabComponent {
  private store = inject(EventDetailStore);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Check = Check; readonly ChevronDown = ChevronDown; readonly ChevronUp = ChevronUp;
  readonly ClipboardList = ClipboardList; readonly GripVertical = GripVertical;
  readonly Pencil = Pencil; readonly Plus = Plus; readonly Save = Save; readonly Trash2 = Trash2;

  formFields = this.store.formFields;
  isNew = this.store.isNew;

  editingFieldId = signal<string | null>(null);
  editDraft: { label: string; type: FormFieldType; required: boolean; optionsStr: string } =
    { label: '', type: 'text', required: false, optionsStr: '' };

  startAddField() {
    this.editDraft = { label: '', type: 'text', required: false, optionsStr: '' };
    this.editingFieldId.set('NEW');
  }

  editField(field: FormField) {
    this.editDraft = {
      label: field.label,
      type: field.type,
      required: field.required,
      optionsStr: field.options?.join(', ') ?? '',
    };
    this.editingFieldId.set(field.id);
  }

  saveFieldEdit() {
    const d = this.editDraft;
    if (!d.label.trim()) { this.toast.error('La pregunta no puede estar vacía'); return; }

    const field: FormField = {
      id: this.editingFieldId() === 'NEW' ? this.genId() : this.editingFieldId()!,
      label: d.label.trim(),
      type: d.type,
      required: d.required,
      options: d.type === 'select' ? d.optionsStr.split(',').map(s => s.trim()).filter(Boolean) : [],
    };

    if (this.editingFieldId() === 'NEW') {
      this.formFields.update(prev => [...prev, field]);
    } else {
      this.formFields.update(prev => prev.map(f => f.id === field.id ? field : f));
    }
    this.editingFieldId.set(null);
  }

  cancelEdit() { this.editingFieldId.set(null); }

  async deleteField(field: FormField) {
    const ok = await this.confirm.confirm({ title: 'Eliminar campo', message: `¿Eliminar la pregunta "${field.label}"?`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.formFields.update(prev => prev.filter(f => f.id !== field.id));
  }

  moveUp(field: FormField) {
    const arr = this.formFields();
    const idx = arr.findIndex(f => f.id === field.id);
    if (idx <= 0) return;
    const next = [...arr];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    this.formFields.set(next);
  }

  moveDown(field: FormField) {
    const arr = this.formFields();
    const idx = arr.findIndex(f => f.id === field.id);
    if (idx >= arr.length - 1) return;
    const next = [...arr];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    this.formFields.set(next);
  }

  fieldTypeLabel(type: FormFieldType): string { return FIELD_TYPE_LABELS[type] ?? type; }

  chipClass(type: FormFieldType): string {
    const map: Record<FormFieldType, string> = {
      text: 'chip-text', textarea: 'chip-textarea', select: 'chip-select',
      checkbox: 'chip-checkbox', number: 'chip-number', email: 'chip-email', phone: 'chip-phone',
      date: 'chip-date',
    };
    return map[type] ?? '';
  }

  private genId(): string {
    return Math.random().toString(36).slice(2, 10);
  }
}
