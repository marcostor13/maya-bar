import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  signal,
  computed,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AuthService } from '../../auth/auth.service';
import {
  LucideAngularModule,
  Zap,
  Trash2,
  Users,
  Wand2,
  Calendar,
  ExternalLink,
  X,
  Ticket,
  Upload,
  ImageIcon,
  Share2,
  Hash,
  Mail,
  Copy,
  Check,
  ArrowLeft,
  Save,
  Search,
  PieChart,
  UserCheck,
  QrCode,
  Film,
  FileText,
  Plus,
  ChevronUp,
  ChevronDown,
  Pencil,
  Layers,
  ClipboardList,
  GripVertical,
  LayoutTemplate,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Link2,
  ScanLine,
  Camera,
} from 'lucide-angular';
import { InvitationDesignerComponent, type DesignSpec } from './invitation-designer';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

type EventStatus = 'draft' | 'published' | 'cancelled';
type AiTool = 'copy' | 'social' | 'hashtags' | 'email';
type FormFieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'email' | 'phone' | 'date';
type ActiveTab = 'general' | 'media' | 'form' | 'marketing' | 'registrations' | 'checkin' | 'stats' | 'invitation' | 'impulsadores';

interface MediaFile {
  url: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
}

interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
}

interface AppEvent {
  _id: string;
  localId: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  capacity: number;
  price: number;
  imageUrl?: string;
  status: EventStatus;
  slug?: string;
  mediaFiles?: MediaFile[];
  formFields?: FormField[];
  invitationDesign?: DesignSpec;
}

interface Registration {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  partySize: number;
  ticketCode: string;
  status: string;
  checkedIn: boolean;
  checkedInAt?: string;
  createdAt: string;
  customFields?: Record<string, string>;
  impulsadorName?: string | null;
}

interface Impulsador {
  _id: string;
  name: string;
  email: string;
  referralCode?: string;
  assigned: boolean;
  type: 'user' | 'external';
}

interface ImpulsadorStat {
  name: string;
  registrations: number;
  attendees: number;
  checkedIn: number;
}

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

const STATUS_META: Record<EventStatus, { label: string; cls: string }> = {
  draft:     { label: 'Borrador',  cls: 'badge-neutral' },
  published: { label: 'Publicado', cls: 'badge-success' },
  cancelled: { label: 'Cancelado', cls: 'badge-danger'  },
};

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule, RouterLink, InvitationDesignerComponent, DatePipe],
  template: `
    <div class="page animate-fade-in">

      <!-- ── Header ── -->
      <div class="page-header">
        <div class="header-left">
          <button class="btn btn-ghost btn-icon" routerLink="/events" aria-label="Volver">
            <lucide-icon [img]="ArrowLeft" [size]="20" [strokeWidth]="2.5"></lucide-icon>
          </button>
          <div>
            <h1>{{ isNew() ? 'Nuevo Evento' : (event()?.title || 'Cargando...') }}</h1>
            <p class="subtitle">{{ isNew() ? 'Crea un nuevo evento para tu local.' : 'Gestión y Marketing IA' }}</p>
          </div>
        </div>
        @if (!isNew() && event()?.slug && event()?.status === 'published') {
          <div class="header-actions">
            <a class="btn btn-secondary" [href]="publicUrl(event()!.slug!)" target="_blank">
              <lucide-icon [img]="ExternalLink" [size]="16" [strokeWidth]="2.5"></lucide-icon>
              Ver página pública
            </a>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="skeleton-form card">
          <div class="skeleton-row"></div>
          <div class="skeleton-row"></div>
          <div class="skeleton-row"></div>
        </div>
      } @else {
        <div class="content-layout">
          <div class="main-column">
            <div class="card p-0 overflow-hidden">

              <!-- ── Tabs ── -->
              <div class="tabs">
                <button class="tab" [class.active]="activeTab() === 'general'" (click)="activeTab.set('general')">
                  Información General
                </button>
                <button class="tab" [class.active]="activeTab() === 'media'" (click)="activeTab.set('media')">
                  <lucide-icon [img]="Layers" [size]="14"></lucide-icon>
                  Medios
                  @if (mediaFiles().length > 0) {
                    <span class="tab-badge">{{ mediaFiles().length }}</span>
                  }
                </button>
                <button class="tab" [class.active]="activeTab() === 'form'" (click)="activeTab.set('form')">
                  <lucide-icon [img]="ClipboardList" [size]="14"></lucide-icon>
                  Formulario
                  @if (formFields().length > 0) {
                    <span class="tab-badge">{{ formFields().length }}</span>
                  }
                </button>
                <button class="tab tab-ai" [class.active]="activeTab() === 'invitation'" (click)="activeTab.set('invitation')">
                  <lucide-icon [img]="LayoutTemplate" [size]="14"></lucide-icon>
                  Invitación
                </button>
                @if (!isNew()) {
                  <button class="tab tab-ai" [class.active]="activeTab() === 'marketing'" (click)="activeTab.set('marketing')">
                    <lucide-icon [img]="Zap" [size]="14"></lucide-icon>
                    Marketing IA
                  </button>
                  <button class="tab" [class.active]="activeTab() === 'registrations'" (click)="activeTab.set('registrations')">
                    <lucide-icon [img]="Users" [size]="14"></lucide-icon>
                    Asistentes
                  </button>
                  <button class="tab" [class.active]="activeTab() === 'impulsadores'" (click)="activeTab.set('impulsadores'); loadImpulsadores()">
                    <lucide-icon [img]="Link2" [size]="14"></lucide-icon>
                    Impulsadores
                  </button>
                  <button class="tab" [class.active]="activeTab() === 'checkin'" (click)="activeTab.set('checkin')">
                    <lucide-icon [img]="UserCheck" [size]="14"></lucide-icon>
                    Check-in
                  </button>
                  <button class="tab" [class.active]="activeTab() === 'stats'" (click)="activeTab.set('stats')">
                    <lucide-icon [img]="PieChart" [size]="14"></lucide-icon>
                    Estadísticas
                  </button>
                }
              </div>

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- ── General Tab ── -->
              <!-- ══════════════════════════════════════════════════════════ -->
              @if (activeTab() === 'general') {
                <div class="p-6">

                  <form [formGroup]="form" (ngSubmit)="saveEvent()">

                    <div class="field mb-5">
                      <label class="field-label">Título del evento *</label>
                      <input class="input input-lg" formControlName="title" placeholder="Ej: Cena Degustación 5 Tiempos" autofocus />
                      @if (form.get('title')?.invalid && form.get('title')?.touched) {
                        <span class="field-hint-error">El título es requerido</span>
                      }
                    </div>

                    <div class="field-row mb-5">
                      <div class="field">
                        <label class="field-label">Fecha *</label>
                        <input class="input" type="date" formControlName="date" />
                        @if (form.get('date')?.invalid && form.get('date')?.touched) {
                          <span class="field-hint-error">La fecha es requerida</span>
                        }
                      </div>
                      <div class="field">
                        <label class="field-label">Estado</label>
                        <select class="input" formControlName="status">
                          <option value="draft">Borrador</option>
                          <option value="published">Publicado</option>
                          <option value="cancelled">Cancelado</option>
                        </select>
                      </div>
                    </div>

                    <div class="field-row mb-5">
                      <div class="field">
                        <label class="field-label">Precio (S/)</label>
                        <input class="input" type="number" formControlName="price" min="0" />
                      </div>
                      <div class="field">
                        <label class="field-label">Capacidad máx. (0 = ilimitada)</label>
                        <input class="input" type="number" formControlName="capacity" min="0" />
                      </div>
                    </div>

                    <div class="field-row mb-6">
                      <div class="field">
                        <label class="field-label">Hora inicio</label>
                        <input class="input" type="time" formControlName="startTime" />
                      </div>
                      <div class="field">
                        <label class="field-label">Hora fin</label>
                        <input class="input" type="time" formControlName="endTime" />
                      </div>
                    </div>

                    <div class="form-actions border-t pt-5 mt-2 flex justify-end">
                      <button type="button" class="btn btn-secondary mr-3" routerLink="/events">Cancelar</button>
                      <button type="submit" class="btn btn-primary" [disabled]="saving() || form.invalid">
                        <lucide-icon [img]="Save" [size]="16" [strokeWidth]="2.5"></lucide-icon>
                        {{ saving() ? 'Guardando...' : (isNew() ? 'Crear Evento' : 'Actualizar Evento') }}
                      </button>
                    </div>
                  </form>
                </div>
              }

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- ── Media Tab ── -->
              <!-- ══════════════════════════════════════════════════════════ -->
              @if (activeTab() === 'media') {
                <div class="p-6 animate-fade-in">
                  <div class="media-header">
                    <div>
                      <h3 class="section-h3">Archivos multimedia</h3>
                      <p class="text-muted-sm">Sube imágenes, videos o documentos. Puedes mencionarlos en el prompt de IA para crear el contenido del evento.</p>
                    </div>
                    <button class="btn btn-secondary" (click)="mediaInput.click()" [disabled]="uploadingMedia()">
                      <lucide-icon [img]="Plus" [size]="16"></lucide-icon>
                      Subir archivos
                    </button>
                  </div>

                  <input #mediaInput type="file" multiple
                    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,application/pdf"
                    (change)="onMediaFilesChange($event)" style="display:none" />

                  @if (uploadingMedia()) {
                    <div class="upload-progress-bar">
                      <div class="upload-progress-inner"></div>
                    </div>
                    <p class="upload-progress-label">Subiendo archivos...</p>
                  }

                  @if (mediaFiles().length === 0) {
                    <div class="media-empty-zone" (click)="mediaInput.click()">
                      <lucide-icon [img]="Layers" [size]="40" [strokeWidth]="1.5"></lucide-icon>
                      <span>Haz clic para subir archivos multimedia</span>
                      <small>Imágenes (JPG, PNG, WEBP) · Videos (MP4, MOV) · Documentos (PDF)</small>
                    </div>
                  } @else {
                    <div class="media-grid">
                      @for (file of mediaFiles(); track file.url) {
                        <div class="media-card">
                          <button class="media-delete-btn" (click)="removeMedia(file)" title="Eliminar">
                            <lucide-icon [img]="X" [size]="12" [strokeWidth]="3"></lucide-icon>
                          </button>
                          <div class="media-thumb">
                            @if (isImage(file.mimeType)) {
                              <img [src]="file.url" [alt]="file.name" />
                            } @else if (isVideo(file.mimeType)) {
                              <div class="media-icon-thumb video">
                                <lucide-icon [img]="Film" [size]="32" [strokeWidth]="1.5"></lucide-icon>
                              </div>
                            } @else {
                              <div class="media-icon-thumb doc">
                                <lucide-icon [img]="FileText" [size]="32" [strokeWidth]="1.5"></lucide-icon>
                              </div>
                            }
                          </div>
                          <div class="media-info">
                            <span class="media-name" [title]="file.name">{{ file.name }}</span>
                            <span class="media-size">{{ formatSize(file.size) }}</span>
                          </div>
                        </div>
                      }
                      <!-- Add more -->
                      <div class="media-card media-add-card" (click)="mediaInput.click()">
                        <lucide-icon [img]="Plus" [size]="28" [strokeWidth]="1.5"></lucide-icon>
                        <span>Agregar más</span>
                      </div>
                    </div>
                  }

                  @if (!isNew()) {
                    <div class="media-save-hint">
                      <lucide-icon [img]="Save" [size]="14"></lucide-icon>
                      Los cambios en Medios se guardan al actualizar el evento desde la pestaña General.
                    </div>
                  }
                </div>
              }

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- ── Form Builder Tab ── -->
              <!-- ══════════════════════════════════════════════════════════ -->
              @if (activeTab() === 'form') {
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
              }

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- ── Invitation Tab ── -->
              <!-- ══════════════════════════════════════════════════════════ -->
              @if (activeTab() === 'invitation') {
                <app-invitation-designer
                  [mediaFiles]="mediaFiles()"
                  [eventId]="eventId()"
                  [initialDesign]="design()"
                  (designChange)="onDesignChange($event)">
                </app-invitation-designer>
              }

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- ── Marketing IA Tab ── -->
              <!-- ══════════════════════════════════════════════════════════ -->
              @if (activeTab() === 'marketing' && !isNew()) {
                <div class="p-6 animate-fade-in">
                  <div class="ai-hero-card">
                    <lucide-icon [img]="Zap" [size]="32" class="ai-hero-icon"></lucide-icon>
                    <div class="ai-hero-text">
                      <h3>Potencia tu evento con IA</h3>
                      <p>Genera contenido persuasivo y materiales para redes sociales en segundos.</p>
                    </div>
                  </div>

                  <div class="ai-tools-list">
                    <button class="ai-item-btn" (click)="runAI('copy')" [disabled]="aiLoading()">
                      <div class="ai-item-icon"><lucide-icon [img]="Wand2" [size]="20"></lucide-icon></div>
                      <div class="ai-item-info">
                        <strong>Re-escribir con IA</strong>
                        <span>Mejora el título y descripción del evento.</span>
                      </div>
                    </button>
                    <button class="ai-item-btn" (click)="runAI('social')" [disabled]="aiLoading()">
                      <div class="ai-item-icon"><lucide-icon [img]="Share2" [size]="20"></lucide-icon></div>
                      <div class="ai-item-info">
                        <strong>Posts para Redes</strong>
                        <span>Genera copys para Instagram y WhatsApp.</span>
                      </div>
                    </button>
                    <button class="ai-item-btn" (click)="runAI('hashtags')" [disabled]="aiLoading()">
                      <div class="ai-item-icon"><lucide-icon [img]="Hash" [size]="20"></lucide-icon></div>
                      <div class="ai-item-info">
                        <strong>Hashtags Estratégicos</strong>
                        <span>15 hashtags optimizados para alcance.</span>
                      </div>
                    </button>
                    <button class="ai-item-btn" (click)="runAI('email')" [disabled]="aiLoading()">
                      <div class="ai-item-icon"><lucide-icon [img]="Mail" [size]="20"></lucide-icon></div>
                      <div class="ai-item-info">
                        <strong>Email de Invitación</strong>
                        <span>Crea una invitación persuasiva completa.</span>
                      </div>
                    </button>
                  </div>

                  @if (aiLoading()) {
                    <div class="ai-loader-overlay">
                      <div class="ai-spinner-lg"></div>
                      <span>La magia está sucediendo...</span>
                    </div>
                  }

                  @if (aiResult()) {
                    <div class="ai-result-card animate-scale-up">
                      <div class="ai-result-header">
                        <span>{{ aiResultLabel() }}</span>
                        <button class="btn-icon-sm" (click)="copyAiResult()">
                          <lucide-icon [img]="copied() ? Check : Copy" [size]="14"></lucide-icon>
                          Copiar
                        </button>
                      </div>
                      <pre class="ai-result-body">{{ aiResult() }}</pre>
                    </div>
                  }
                </div>
              }

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- ── Registrations Tab ── -->
              <!-- ══════════════════════════════════════════════════════════ -->
              @if (activeTab() === 'registrations' && !isNew()) {
                <div class="p-6 animate-fade-in">

                  <!-- Filter bar -->
                  <div class="regs-toolbar">
                    <div class="regs-search-wrap">
                      <lucide-icon [img]="Search" [size]="16"></lucide-icon>
                      <input type="text" class="regs-search-input" placeholder="Buscar por nombre, email o ticket..."
                        [value]="regSearch()" (input)="onRegSearchChange($any($event.target).value)" />
                    </div>
                    <select class="input regs-filter-select"
                      [value]="regStatusFilter()"
                      (change)="regStatusFilter.set($any($event.target).value); onRegFilterChange()">
                      <option value="all">Todos los estados</option>
                      <option value="confirmed">Confirmados</option>
                      <option value="cancelled">Cancelados</option>
                    </select>
                    <button class="btn btn-secondary btn-sm" (click)="downloadExcel()" [disabled]="registrations().length === 0">
                      <lucide-icon [img]="Download" [size]="15"></lucide-icon>
                      Excel
                    </button>
                  </div>

                  <div class="regs-meta">
                    <span class="badge badge-neutral">{{ registrations().length }} registros</span>
                    @if (regsLoading()) { <span class="text-muted-xs">Cargando...</span> }
                  </div>

                  @if (!regsLoading() && registrations().length === 0) {
                    <div class="regs-empty">
                      <lucide-icon [img]="Ticket" [size]="48" [strokeWidth]="1.5"></lucide-icon>
                      <p>Sin registros para este filtro.</p>
                    </div>
                  } @else {
                    <div class="regs-table-wrap">
                      <table class="regs-table">
                        <thead>
                          <tr>
                            @if (formFields().length > 0) { <th class="th-expand"></th> }
                            <th class="th-sortable" (click)="setSortBy('name')">
                              Nombre
                              <lucide-icon [img]="regSortBy()==='name' ? (regSortOrder()==='asc' ? ArrowUp : ArrowDown) : ArrowUpDown" [size]="13"></lucide-icon>
                            </th>
                            <th class="th-sortable" (click)="setSortBy('email')">
                              Email
                              <lucide-icon [img]="regSortBy()==='email' ? (regSortOrder()==='asc' ? ArrowUp : ArrowDown) : ArrowUpDown" [size]="13"></lucide-icon>
                            </th>
                            <th>Teléfono</th>
                            <th class="th-sortable" (click)="setSortBy('partySize')">
                              Pers.
                              <lucide-icon [img]="regSortBy()==='partySize' ? (regSortOrder()==='asc' ? ArrowUp : ArrowDown) : ArrowUpDown" [size]="13"></lucide-icon>
                            </th>
                            <th>Ticket</th>
                            <th>Impulsador</th>
                            <th>Check-in</th>
                            <th>Estado</th>
                            <th class="th-sortable" (click)="setSortBy('createdAt')">
                              Fecha
                              <lucide-icon [img]="regSortBy()==='createdAt' ? (regSortOrder()==='asc' ? ArrowUp : ArrowDown) : ArrowUpDown" [size]="13"></lucide-icon>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (r of registrations(); track r._id) {
                            <tr class="reg-row" [class.reg-row-expanded]="expandedRegIds().has(r._id)">
                              @if (formFields().length > 0) {
                                <td class="td-expand">
                                  @if (r.customFields && hasCustomFields(r.customFields)) {
                                    <button class="expand-btn" (click)="toggleExpandReg(r._id)"
                                      [class.expanded]="expandedRegIds().has(r._id)" title="Ver campos personalizados">
                                      <lucide-icon [img]="ChevronDown" [size]="14" [strokeWidth]="2.5"></lucide-icon>
                                    </button>
                                  }
                                </td>
                              }
                              <td class="td-name">{{ r.name }}</td>
                              <td class="td-muted">{{ r.email }}</td>
                              <td class="td-muted">{{ r.phone || '—' }}</td>
                              <td class="td-center">{{ r.partySize }}</td>
                              <td><code class="ticket-code">{{ r.ticketCode }}</code></td>
                              <td>
                                @if (r.impulsadorName) {
                                  <span class="badge badge-neutral">{{ r.impulsadorName }}</span>
                                } @else {
                                  <span class="td-muted">Directo</span>
                                }
                              </td>
                              <td class="td-center">
                                @if (r.checkedIn) {
                                  <span class="checkin-pill yes">
                                    <lucide-icon [img]="Check" [size]="12" [strokeWidth]="3"></lucide-icon> Sí
                                  </span>
                                } @else {
                                  <span class="checkin-pill no">—</span>
                                }
                              </td>
                              <td>
                                <span class="badge" [class.badge-success]="r.status === 'confirmed'"
                                  [class.badge-danger]="r.status === 'cancelled'">
                                  {{ r.status === 'confirmed' ? 'Confirmado' : 'Cancelado' }}
                                </span>
                              </td>
                              <td class="td-muted td-date">{{ r.createdAt | date:'dd/MM/yy' }}</td>
                            </tr>
                            @if (expandedRegIds().has(r._id) && r.customFields && hasCustomFields(r.customFields)) {
                              <tr class="custom-fields-row">
                                <td [colSpan]="formFields().length > 0 ? 10 : 9">
                                  <div class="custom-fields-answers">
                                    @for (field of formFields(); track field.id) {
                                      @if (r.customFields && r.customFields[field.id]) {
                                        <span class="custom-answer-item">
                                          <strong>{{ field.label }}:</strong> {{ r.customFields[field.id] }}
                                        </span>
                                      }
                                    }
                                  </div>
                                </td>
                              </tr>
                            }
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </div>
              }

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- ── Impulsadores Tab ── -->
              <!-- ══════════════════════════════════════════════════════════ -->
              @if (activeTab() === 'impulsadores' && !isNew()) {
                <div class="p-6 animate-fade-in">
                  <div class="mb-5 flex justify-between items-center">
                    <div>
                      <h3 class="section-h3">Links por impulsador</h3>
                      <p class="text-muted-sm">Activa un impulsador para este evento y comparte su link único. Los registros hechos con ese link se atribuyen automáticamente a su nombre.</p>
                    </div>
                  </div>

                  @if (impulsadoresLoading()) {
                    <div class="regs-empty">
                      <p>Cargando impulsadores...</p>
                    </div>
                  } @else {
                    <div class="impulsador-section-header">
                      <h4 class="section-sub-title">Con cuenta en la plataforma</h4>
                    </div>
                    @if (userImpulsadores().length === 0) {
                      <div class="regs-empty mb-5">
                        <p>Sin usuarios con rol Impulsador. Créalos desde Usuarios.</p>
                      </div>
                    } @else {
                      <div class="impulsador-list mb-6">
                        @for (imp of userImpulsadores(); track imp._id) {
                          <div class="impulsador-row" [class.is-assigned]="imp.assigned">
                            <label class="impulsador-toggle">
                              <input type="checkbox" [checked]="imp.assigned" (change)="toggleImpulsador(imp)" />
                              <span class="impulsador-name">{{ imp.name }}</span>
                            </label>
                            <span class="text-muted-xs">{{ imp.email }}</span>
                            @if (imp.assigned && imp.referralCode) {
                              <button class="btn btn-sm btn-secondary" (click)="copyImpulsadorLink(imp)">
                                <lucide-icon [img]="impulsadorLinkCopiedId() === imp._id ? Check : Copy" [size]="14"></lucide-icon>
                                {{ impulsadorLinkCopiedId() === imp._id ? 'Copiado' : 'Copiar link' }}
                              </button>
                            }
                          </div>
                        }
                      </div>
                    }

                    <div class="impulsador-section-header">
                      <h4 class="section-sub-title">Impulsadores externos (sin cuenta)</h4>
                      <button class="btn btn-sm btn-secondary" (click)="openExternalForm()">
                        <lucide-icon [img]="Plus" [size]="14"></lucide-icon>
                        Nuevo impulsador externo
                      </button>
                    </div>
                    @if (externalImpulsadores().length === 0) {
                      <div class="regs-empty">
                        <lucide-icon [img]="Link2" [size]="40" [strokeWidth]="1.5"></lucide-icon>
                        <p>Sin impulsadores externos. Crea uno para generar su link sin necesidad de una cuenta.</p>
                      </div>
                    } @else {
                      <div class="impulsador-list">
                        @for (imp of externalImpulsadores(); track imp._id) {
                          <div class="impulsador-row is-assigned">
                            <span class="impulsador-name flex-1">{{ imp.name }}</span>
                            @if (imp.email) { <span class="text-muted-xs">{{ imp.email }}</span> }
                            <button class="btn btn-sm btn-secondary" (click)="copyImpulsadorLink(imp)">
                              <lucide-icon [img]="impulsadorLinkCopiedId() === imp._id ? Check : Copy" [size]="14"></lucide-icon>
                              {{ impulsadorLinkCopiedId() === imp._id ? 'Copiado' : 'Copiar link' }}
                            </button>
                            <button class="btn-icon-xs danger" (click)="deleteExternalImpulsador(imp)" title="Eliminar">
                              <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                            </button>
                          </div>
                        }
                      </div>
                    }
                  }
                </div>
              }

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- ── Check-in Tab ── -->
              <!-- ══════════════════════════════════════════════════════════ -->
              @if (activeTab() === 'checkin' && !isNew()) {
                <div class="p-6 animate-fade-in">
                  <div class="flex justify-between items-center mb-6 gap-4">
                    <div class="search-box">
                      <lucide-icon [img]="Search" [size]="18"></lucide-icon>
                      <input type="text" placeholder="Buscar por nombre, email o ticket..."
                        [value]="regSearch()" (input)="regSearch.set($any($event.target).value)" />
                    </div>
                    <button class="btn btn-primary" (click)="openScanner()">
                      <lucide-icon [img]="ScanLine" [size]="16" [strokeWidth]="2.5"></lucide-icon>
                      Escanear QR
                    </button>
                    <div class="stats-mini">
                      <strong>{{ checkedInCount() }}</strong> / {{ totalAttendees() }} presentes
                    </div>
                  </div>
                  @if (filteredRegistrations().length === 0) {
                    <div class="regs-empty">
                      <lucide-icon [img]="Search" [size]="48" [strokeWidth]="1.5"></lucide-icon>
                      <p>No se encontraron asistentes con ese criterio.</p>
                    </div>
                  } @else {
                    <div class="checkin-list">
                      @for (r of filteredRegistrations(); track r._id) {
                        <div class="checkin-card" [class.is-checked]="r.checkedIn">
                          <div class="checkin-info">
                            <strong>{{ r.name }}</strong>
                            <div class="checkin-meta">
                              <span>{{ r.email }}</span>
                              <span class="dot">·</span>
                              <code class="ticket-code-sm">{{ r.ticketCode }}</code>
                              <span class="dot">·</span>
                              <span>{{ r.impulsadorName || 'Directo' }}</span>
                            </div>
                          </div>
                          <div class="checkin-action">
                            @if (r.checkedIn) {
                              <div class="checked-label">
                                <lucide-icon [img]="Check" [size]="16" [strokeWidth]="3"></lucide-icon>
                                Listo
                              </div>
                            } @else {
                              <button class="btn btn-sm btn-primary" (click)="doCheckIn(r)" [disabled]="checkingInId() === r._id">
                                {{ checkingInId() === r._id ? '...' : 'Check-in' }}
                              </button>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              }

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- ── Stats Tab ── -->
              <!-- ══════════════════════════════════════════════════════════ -->
              @if (activeTab() === 'stats' && !isNew()) {
                <div class="p-6 animate-fade-in">
                  <div class="stats-grid">
                    <div class="stat-card">
                      <div class="stat-label">Total Registros</div>
                      <div class="stat-value">{{ registrations().length }}</div>
                      <div class="stat-desc">Personas únicas registradas</div>
                    </div>
                    <div class="stat-card">
                      <div class="stat-label">Total Asistentes</div>
                      <div class="stat-value">{{ totalAttendees() }}</div>
                      <div class="stat-desc">Sumatoria de party size</div>
                    </div>
                    <div class="stat-card brand">
                      <div class="stat-label">Asistencia Real</div>
                      <div class="stat-value">{{ checkedInCount() }}</div>
                      <div class="stat-desc">{{ attendanceRate() }}% de los esperados</div>
                    </div>
                    <div class="stat-card">
                      <div class="stat-label">Recaudación Est.</div>
                      <div class="stat-value">S/ {{ estimatedRevenue() }}</div>
                      <div class="stat-desc">Basado en precio x personas</div>
                    </div>
                  </div>
                  <div class="mt-8">
                    <h3 class="section-h3 mb-4">Asistentes por impulsador</h3>
                    @if (impulsadorStats().length === 0) {
                      <div class="p-8 border border-dashed rounded-2xl text-center text-muted">
                        <lucide-icon [img]="PieChart" [size]="48" class="mb-4 opacity-20"></lucide-icon>
                        <p>Aún no hay registros para mostrar.</p>
                      </div>
                    } @else {
                      <div class="impulsador-stats-list">
                        @for (s of impulsadorStats(); track s.name) {
                          <div class="impulsador-stat-row">
                            <div class="impulsador-stat-header">
                              <span class="impulsador-stat-name">{{ s.name }}</span>
                              <span class="impulsador-stat-nums">{{ s.attendees }} asistentes · {{ s.checkedIn }} en check-in</span>
                            </div>
                            <div class="impulsador-stat-bar-track">
                              <div class="impulsador-stat-bar-fill" [style.width.%]="(s.attendees / maxImpulsadorAttendees()) * 100"></div>
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                </div>
              }

            </div>
          </div>
        </div>
      }
    </div>

    <!-- ── QR Scanner modal ── -->
    @if (scannerOpen()) {
      <div class="overlay" role="dialog" aria-modal="true">
        <div class="scanner-modal">
          <div class="scanner-header">
            <h3>Escanear código QR</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeScanner()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>
          <div id="qr-reader" class="qr-reader"></div>
          @if (lastScanResult()) {
            <div class="scan-result" [class.already]="lastScanResult()!.alreadyCheckedIn">
              <lucide-icon [img]="Check" [size]="20" [strokeWidth]="3"></lucide-icon>
              <div>
                <strong>{{ lastScanResult()!.name }}</strong>
                <span>{{ lastScanResult()!.impulsadorName ? 'Invitado por ' + lastScanResult()!.impulsadorName : 'Invitación directa' }}</span>
              </div>
            </div>
          }
          <p class="scanner-hint">Apunta la cámara al código QR de la invitación.</p>
        </div>
      </div>
    }

    <!-- ── Nuevo impulsador externo modal ── -->
    @if (showExternalForm()) {
      <div class="overlay" (click)="closeExternalForm()" role="dialog" aria-modal="true">
        <div class="external-modal" (click)="$event.stopPropagation()">
          <div class="scanner-header">
            <h3>Nuevo impulsador externo</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeExternalForm()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>
          <p class="text-muted-sm mb-5">Crea un impulsador sin cuenta en la plataforma. Solo necesitas su nombre para generar un link de invitación único.</p>
          <div class="field mb-4">
            <label class="field-label">Nombre *</label>
            <input class="input" [value]="externalForm.name" (input)="externalForm.name = $any($event.target).value" placeholder="Ej: Juan Pérez" autofocus />
          </div>
          <div class="field mb-4">
            <label class="field-label">Teléfono (opcional)</label>
            <input class="input" [value]="externalForm.phone" (input)="externalForm.phone = $any($event.target).value" placeholder="+51 999 999 999" />
          </div>
          <div class="field mb-5">
            <label class="field-label">Email (opcional)</label>
            <input class="input" type="email" [value]="externalForm.email" (input)="externalForm.email = $any($event.target).value" placeholder="correo@ejemplo.com" />
          </div>
          <div class="flex justify-end gap-2">
            <button class="btn btn-secondary" (click)="closeExternalForm()">Cancelar</button>
            <button class="btn btn-primary" (click)="saveExternalImpulsador()" [disabled]="savingExternal()">
              {{ savingExternal() ? 'Creando...' : 'Crear impulsador' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:32px; gap:16px; flex-wrap:wrap; }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .page-header h1 { font-size:26px; font-weight:800; margin:0 0 4px; font-family:var(--font-heading); letter-spacing:-0.5px; }
    .subtitle { color:var(--color-text-muted); margin:0; font-size:15px; }

    .content-layout { display: flex; flex-direction: column; gap: 24px; }
    .main-column { flex: 1; }

    /* ── Tabs ── */
    .tabs { display: flex; border-bottom: 1px solid var(--color-border); background: #fafafa; padding: 0 16px; overflow-x: auto; }
    .tab { padding: 16px 20px; font-size: 14px; font-weight: 600; color: var(--color-text-muted); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; margin-bottom: -1px; white-space: nowrap; flex-shrink: 0; }
    .tab:hover { color: var(--color-text-main); }
    .tab.active { color: var(--color-brand); border-bottom-color: var(--color-brand); background: #fff; }
    .tab-ai { color: var(--color-brand); opacity: 0.8; }
    .tab-ai.active { opacity: 1; }
    .tab-badge { background: var(--color-brand); color: #fff; font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 99px; min-width: 18px; text-align: center; }

    /* ── Utils ── */
    .p-0 { padding: 0; } .p-6 { padding: 24px; } .p-8 { padding: 32px; }
    .mb-5 { margin-bottom: 20px; } .mb-6 { margin-bottom: 24px; } .mt-2 { margin-top: 8px; } .mt-3 { margin-top: 12px; } .mt-4 { margin-top: 16px; } .mt-8 { margin-top: 32px; }
    .pt-5 { padding-top: 20px; } .mr-3 { margin-right: 12px; }
    .flex { display: flex; } .flex-1 { flex: 1; }
    .gap-2 { gap: 8px; } .gap-4 { gap: 16px; }
    .justify-end { justify-content: flex-end; } .justify-between { justify-content: space-between; } .items-center { align-items: center; }
    .border-t { border-top: 1px solid var(--color-border); }
    .overflow-hidden { overflow: hidden; } .font-bold { font-weight: 700; } .text-lg { font-size: 18px; } .m-0 { margin: 0; }
    .text-muted { color: var(--color-text-muted); }
    .text-muted-sm { font-size: 14px; color: var(--color-text-muted); margin: 4px 0 0; line-height: 1.5; }
    .text-muted-xs { font-size: 12px; color: var(--color-text-muted); }
    .border-dashed { border-style: dashed; }
    .rounded-2xl { border-radius: 16px; }
    .text-center { text-align: center; }
    .opacity-20 { opacity: 0.2; }
    .mb-4 { margin-bottom: 16px; }

    /* ── Fields ── */
    .field { display: flex; flex-direction: column; gap: 8px; }
    .field-row { display: flex; gap: 20px; }
    .field-row .field { flex: 1; }
    .field-label { font-size: 14px; font-weight: 600; color: var(--color-text-main); }
    .input-lg { font-size: 16px; padding: 12px 16px; }
    .field-hint-error { font-size: 12px; color: var(--color-error); margin-top: 2px; }

    /* ── Upload cover ── */
    .upload-zone { border: 2px dashed var(--color-border); border-radius: 16px; padding: 48px 24px; text-align: center; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--color-text-muted); background: var(--color-bg-app); }
    .upload-zone:hover { border-color: var(--color-brand); background: var(--color-brand-light); color: var(--color-brand); transform: translateY(-2px); }
    .upload-zone small { font-size: 13px; opacity: 0.7; }
    .upload-spinner { width: 28px; height: 28px; border: 3px solid var(--color-border); border-top-color: var(--color-brand); border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg) } }
    .img-preview { position: relative; border-radius: 16px; overflow: hidden; height: 240px; box-shadow: var(--shadow-sm); }
    .img-preview img { width: 100%; height: 100%; object-fit: cover; }
    .img-clear { position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.6); color: #fff; border: none; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(4px); transition: all 0.2s; }
    .img-clear:hover { background: var(--color-error); transform: scale(1.1); }

    /* ── Media tab ── */
    .media-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; }
    .section-h3 { margin: 0; font-size: 17px; font-weight: 700; font-family: var(--font-heading); }
    .media-empty-zone { border: 2px dashed var(--color-border); border-radius: 16px; padding: 64px 24px; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--color-text-muted); background: var(--color-bg-app); transition: all 0.2s; }
    .media-empty-zone:hover { border-color: var(--color-brand); background: var(--color-brand-light); color: var(--color-brand); }
    .media-empty-zone small { font-size: 13px; opacity: 0.7; }
    .media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; margin-top: 8px; }
    .media-card { position: relative; border-radius: 14px; border: 1px solid var(--color-border); overflow: hidden; background: #fff; transition: box-shadow 0.2s, transform 0.2s; }
    .media-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
    .media-delete-btn { position: absolute; top: 6px; right: 6px; z-index: 2; width: 24px; height: 24px; background: rgba(0,0,0,0.55); border: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff; opacity: 0; transition: opacity 0.2s; }
    .media-card:hover .media-delete-btn { opacity: 1; }
    .media-delete-btn:hover { background: var(--color-error); }
    .media-thumb { height: 110px; overflow: hidden; background: var(--color-bg-app); }
    .media-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .media-icon-thumb { height: 100%; display: flex; align-items: center; justify-content: center; }
    .media-icon-thumb.video { background: #fff7ed; color: #f97316; }
    .media-icon-thumb.doc { background: #eff6ff; color: #3b82f6; }
    .media-info { padding: 10px 12px; }
    .media-name { display: block; font-size: 12px; font-weight: 600; color: var(--color-text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .media-size { display: block; font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
    .media-add-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; background: var(--color-bg-app); color: var(--color-text-muted); border-style: dashed; min-height: 155px; font-size: 13px; font-weight: 600; }
    .media-add-card:hover { border-color: var(--color-brand); color: var(--color-brand); background: var(--color-brand-light); }
    .upload-progress-bar { height: 4px; background: var(--color-border); border-radius: 2px; overflow: hidden; margin-bottom: 8px; }
    .upload-progress-inner { height: 100%; background: var(--color-brand); border-radius: 2px; animation: progressAnim 1.2s ease-in-out infinite; }
    @keyframes progressAnim { 0%{width:0;margin-left:0} 50%{width:60%;margin-left:20%} 100%{width:0;margin-left:100%} }
    .upload-progress-label { font-size: 13px; color: var(--color-text-muted); text-align: center; margin-bottom: 16px; }
    .media-save-hint { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-text-muted); padding: 12px 16px; background: var(--color-bg-app); border-radius: 10px; border: 1px solid var(--color-border); margin-top: 20px; }

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

    /* ── AI Marketing tab ── */
    .ai-hero-card { position:relative; overflow:hidden; background:linear-gradient(135deg,#FF3366 0%,#FF9933 100%); padding:32px; border-radius:16px; color:#fff; display:flex; align-items:center; gap:24px; box-shadow:0 12px 24px rgba(255,51,102,0.2); margin-bottom:24px; }
    .ai-hero-card::before { content:''; position:absolute; inset:0; background:url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==') repeat; opacity:0.5; }
    .ai-hero-card::after { content:''; position:absolute; top:-50%; left:-50%; width:200%; height:200%; background:radial-gradient(circle,rgba(255,255,255,0.2) 0%,transparent 60%); animation:slowSpin 15s linear infinite; pointer-events:none; }
    @keyframes slowSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    .ai-hero-icon { opacity:1; filter:drop-shadow(0 4px 8px rgba(0,0,0,0.2)); z-index:1; }
    .ai-hero-text { z-index:1; }
    .ai-hero-text h3 { margin:0 0 8px; font-size:24px; font-weight:800; letter-spacing:-0.5px; }
    .ai-hero-text p { margin:0; font-size:15px; opacity:0.95; line-height:1.5; }
    .ai-tools-list { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px; }
    .ai-item-btn { display:flex; align-items:center; gap:16px; padding:24px; background:#fff; border:1px solid var(--color-border); border-radius:16px; text-align:left; cursor:pointer; transition:all 0.3s cubic-bezier(0.175,0.885,0.32,1.275); }
    .ai-item-btn:hover:not(:disabled) { border-color:var(--color-brand); box-shadow:0 8px 24px rgba(225,29,72,0.12); transform:translateY(-4px); }
    .ai-item-icon { width:52px; height:52px; background:var(--color-brand-light); color:var(--color-brand); border-radius:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:transform 0.3s; }
    .ai-item-btn:hover .ai-item-icon { transform:scale(1.1) rotate(-5deg); }
    .ai-item-info { display:flex; flex-direction:column; gap:4px; }
    .ai-item-info strong { font-size:16px; font-weight:700; color:var(--color-text-main); }
    .ai-item-info span { font-size:13px; color:var(--color-text-muted); line-height:1.4; }
    .ai-loader-overlay { padding:40px; display:flex; flex-direction:column; align-items:center; gap:16px; color:var(--color-brand); font-weight:600; font-size:16px; }
    .ai-spinner-lg { width:48px; height:48px; border:4px solid var(--color-brand-light); border-top-color:var(--color-brand); border-radius:50%; animation:spin .8s linear infinite; }
    .ai-result-card { background:var(--color-bg-app); border-radius:16px; border:1px solid var(--color-border); overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.05); }
    .ai-result-header { padding:16px 24px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--color-border); font-size:14px; font-weight:700; color:var(--color-brand); text-transform:uppercase; background:rgba(255,255,255,0.5); }
    .ai-result-body { margin:0; padding:24px; font-size:15px; line-height:1.6; white-space:pre-wrap; font-family:inherit; color:var(--color-text-main); max-height:400px; overflow-y:auto; }
    .btn-icon-sm { background:none; border:none; display:flex; align-items:center; gap:6px; color:var(--color-text-muted); cursor:pointer; font-weight:600; transition:all 0.2s; padding:6px 12px; border-radius:6px; }
    .btn-icon-sm:hover { color:var(--color-brand); background:var(--color-brand-light); }

    /* ── Registrations ── */
    .regs-toolbar { display:flex; gap:10px; align-items:center; margin-bottom:14px; flex-wrap:wrap; }
    .regs-search-wrap { flex:1; min-width:180px; position:relative; display:flex; align-items:center; }
    .regs-search-wrap lucide-icon { position:absolute; left:12px; color:var(--color-text-muted); pointer-events:none; }
    .regs-search-input { width:100%; padding:9px 14px 9px 36px; border:1px solid var(--color-border); border-radius:10px; font-size:14px; outline:none; background:var(--color-bg-app); transition:all 0.2s; }
    .regs-search-input:focus { border-color:var(--color-brand); background:#fff; box-shadow:0 0 0 3px var(--color-brand-light); }
    .regs-filter-select { width:auto; min-width:160px; padding:9px 14px; font-size:14px; }
    .regs-meta { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
    .regs-empty { padding:64px 40px; text-align:center; color:var(--color-text-muted); display:flex; flex-direction:column; align-items:center; gap:16px; background:var(--color-bg-app); border-radius:16px; border:1px dashed var(--color-border); }
    .regs-table-wrap { overflow-x:auto; border-radius:14px; border:1px solid var(--color-border); }
    .regs-table { width:100%; border-collapse:collapse; }
    .regs-table thead { background:var(--color-bg-app); }
    .regs-table th { padding:11px 14px; text-align:left; font-size:12px; font-weight:700; color:var(--color-text-muted); text-transform:uppercase; letter-spacing:0.04em; border-bottom:1px solid var(--color-border); white-space:nowrap; }
    .th-sortable { cursor:pointer; user-select:none; }
    .th-sortable:hover { color:var(--color-text-main); background:rgba(0,0,0,0.02); }
    .th-sortable lucide-icon { vertical-align:middle; margin-left:4px; }
    .th-expand { width:36px; padding:0 4px; }
    .regs-table td { padding:12px 14px; font-size:14px; color:var(--color-text-main); border-bottom:1px solid var(--color-border); vertical-align:middle; }
    .regs-table tbody tr:last-child td { border-bottom:none; }
    .regs-table tbody tr:last-child.custom-fields-row td { border-bottom:none; }
    .reg-row:hover td { background:var(--color-bg-app); }
    .reg-row-expanded td { background:var(--color-brand-light); }
    .td-muted { color:var(--color-text-muted); font-size:13px; }
    .td-center { text-align:center; }
    .td-name { font-weight:600; }
    .td-expand { width:36px; padding:0 4px 0 8px; }
    .td-date { font-size:12px; white-space:nowrap; }
    .expand-btn { width:26px; height:26px; border:none; background:transparent; border-radius:6px; cursor:pointer; color:var(--color-text-muted); display:flex; align-items:center; justify-content:center; transition:all 0.2s; }
    .expand-btn:hover { background:var(--color-brand-light); color:var(--color-brand); }
    .expand-btn.expanded { color:var(--color-brand); transform:rotate(180deg); }
    .checkin-pill { display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:700; padding:3px 8px; border-radius:20px; }
    .checkin-pill.yes { background:#dcfce7; color:#16a34a; }
    .checkin-pill.no { background:var(--color-bg-app); color:var(--color-text-muted); }
    .ticket-code { font-family:monospace; font-size:12px; font-weight:700; background:var(--color-bg-app); padding:3px 7px; border-radius:6px; color:var(--color-brand); letter-spacing:0.05em; }
    .custom-fields-row td { padding:8px 14px 12px; background:#f8faff; }
    .custom-fields-answers { display:flex; flex-wrap:wrap; gap:8px; }
    .custom-answer-item { font-size:12px; color:var(--color-text-muted); background:#fff; border:1px solid var(--color-border); padding:3px 10px; border-radius:8px; }
    .custom-answer-item strong { color:var(--color-text-main); }

    /* ── Skeleton ── */
    .skeleton-form { display:flex; flex-direction:column; gap:24px; padding:32px; }
    .skeleton-row { height:48px; background:var(--color-bg-app); border-radius:var(--radius-lg); animation:pulse 1.5s ease-in-out infinite; }
    .skeleton-row:nth-child(2) { height:120px; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

    /* ── Impulsadores ── */
    .impulsador-section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
    .impulsador-list { display:flex; flex-direction:column; gap:10px; }
    .impulsador-row { display:flex; align-items:center; gap:16px; padding:14px 18px; background:#fff; border:1px solid var(--color-border); border-radius:14px; transition:all 0.2s; }
    .impulsador-row.is-assigned { background:var(--color-brand-light); border-color:rgba(225,29,72,0.2); }
    .impulsador-toggle { display:flex; align-items:center; gap:10px; cursor:pointer; font-weight:600; font-size:14px; flex:1; }
    .impulsador-toggle input[type="checkbox"] { width:18px; height:18px; cursor:pointer; accent-color:var(--color-brand); }
    .impulsador-name { color:var(--color-text-main); }

    /* ── Check-in ── */
    .search-box { flex:1; position:relative; display:flex; align-items:center; }
    .search-box lucide-icon { position:absolute; left:16px; color:var(--color-text-muted); pointer-events:none; }
    .search-box input { width:100%; padding:12px 16px 12px 48px; border-radius:12px; border:1px solid var(--color-border); background:var(--color-bg-app); font-size:15px; outline:none; transition:all 0.2s; }
    .search-box input:focus { border-color:var(--color-brand); background:#fff; box-shadow:0 0 0 4px var(--color-brand-light); }
    .stats-mini { font-size:14px; color:var(--color-text-muted); white-space:nowrap; }
    .stats-mini strong { color:var(--color-brand); font-size:18px; }
    .checkin-list { display:flex; flex-direction:column; gap:12px; }
    .checkin-card { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; background:#fff; border:1px solid var(--color-border); border-radius:16px; transition:all 0.2s; }
    .checkin-card:hover { border-color:var(--color-brand); transform:translateX(4px); }
    .checkin-card.is-checked { background:var(--color-brand-light); border-color:rgba(225,29,72,0.2); }
    .checkin-info { display:flex; flex-direction:column; gap:4px; }
    .checkin-info strong { font-size:16px; color:var(--color-text-main); }
    .checkin-meta { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--color-text-muted); }
    .dot { opacity:0.5; }
    .ticket-code-sm { font-family:monospace; font-weight:700; color:var(--color-brand); background:rgba(255,255,255,0.5); padding:2px 6px; border-radius:4px; }
    .checked-label { display:flex; align-items:center; gap:6px; color:var(--color-brand); font-weight:700; font-size:14px; text-transform:uppercase; }

    /* ── Impulsador stats bars ── */
    .impulsador-stats-list { display:flex; flex-direction:column; gap:16px; }
    .impulsador-stat-row { display:flex; flex-direction:column; gap:6px; }
    .impulsador-stat-header { display:flex; justify-content:space-between; align-items:baseline; font-size:14px; }
    .impulsador-stat-name { font-weight:700; color:var(--color-text-main); }
    .impulsador-stat-nums { color:var(--color-text-muted); font-size:13px; }
    .impulsador-stat-bar-track { height:10px; background:var(--color-bg-app); border-radius:9999px; overflow:hidden; }
    .impulsador-stat-bar-fill { height:100%; background:var(--color-brand); border-radius:9999px; transition:width 0.4s ease; }

    /* ── Nuevo impulsador externo modal ── */
    .external-modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; background:#fff; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }

    /* ── QR Scanner modal ── */
    .scanner-modal { width:calc(100% - 48px); max-width:420px; padding:28px 32px; background:#fff; border-radius:24px; box-shadow:var(--shadow-lg); }
    .scanner-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
    .scanner-header h3 { margin:0; font-size:18px; font-weight:700; font-family:var(--font-heading); }
    .qr-reader { width:100%; border-radius:16px; overflow:hidden; background:#000; min-height:250px; }
    .scanner-hint { text-align:center; color:var(--color-text-muted); font-size:13px; margin:16px 0 0; }
    .scan-result { display:flex; align-items:center; gap:12px; padding:14px 16px; border-radius:14px; background:#dcfce7; color:#16a34a; margin-top:16px; }
    .scan-result.already { background:#fef3c7; color:#92400e; }
    .scan-result div { display:flex; flex-direction:column; gap:2px; font-size:13px; }
    .scan-result strong { font-size:15px; }

    /* ── Stats ── */
    .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:20px; }
    .stat-card { padding:24px; background:#fff; border:1px solid var(--color-border); border-radius:20px; display:flex; flex-direction:column; gap:4px; }
    .stat-card.brand { background:var(--color-brand); border-color:var(--color-brand); color:#fff; }
    .stat-card.brand .stat-label, .stat-card.brand .stat-desc { color:rgba(255,255,255,0.8); }
    .stat-label { font-size:13px; font-weight:600; text-transform:uppercase; color:var(--color-text-muted); }
    .stat-value { font-size:32px; font-weight:800; font-family:var(--font-heading); }
    .stat-desc { font-size:12px; color:var(--color-text-muted); }
  `],
})
export class EventDetailComponent implements OnInit {
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);

  readonly Zap = Zap; readonly Trash2 = Trash2; readonly Users = Users;
  readonly Wand2 = Wand2; readonly Calendar = Calendar; readonly ExternalLink = ExternalLink;
  readonly X = X; readonly Ticket = Ticket; readonly Upload = Upload;
  readonly ImageIcon = ImageIcon; readonly Share2 = Share2;
  readonly Hash = Hash; readonly Mail = Mail; readonly Copy = Copy;
  readonly Check = Check; readonly ArrowLeft = ArrowLeft; readonly Save = Save;
  readonly Search = Search; readonly PieChart = PieChart; readonly UserCheck = UserCheck;
  readonly QrCode = QrCode; readonly Film = Film; readonly FileText = FileText;
  readonly Plus = Plus; readonly ChevronUp = ChevronUp; readonly ChevronDown = ChevronDown;
  readonly Pencil = Pencil; readonly Layers = Layers; readonly ClipboardList = ClipboardList;
  readonly GripVertical = GripVertical; readonly LayoutTemplate = LayoutTemplate;
  readonly Download = Download; readonly ArrowUpDown = ArrowUpDown;
  readonly ArrowUp = ArrowUp; readonly ArrowDown = ArrowDown;
  readonly Link2 = Link2; readonly ScanLine = ScanLine; readonly Camera = Camera;

  isNew = signal(false);
  eventId = signal<string | null>(null);
  localId = signal<string | null>(null);
  event = signal<AppEvent | null>(null);

  loading = signal(true);
  saving = signal(false);
  activeTab = signal<ActiveTab>('general');

  checkingInId = signal<string | null>(null);

  uploading = signal(false);
  previewUrl = signal('');

  // Media files
  mediaFiles = signal<MediaFile[]>([]);
  uploadingMedia = signal(false);

  // Form fields (custom questions)
  formFields = signal<FormField[]>([]);
  editingFieldId = signal<string | null>(null);
  editDraft: { label: string; type: FormFieldType; required: boolean; optionsStr: string } =
    { label: '', type: 'text', required: false, optionsStr: '' };

  // Invitation design (kept in memory for new events, saved with event)
  design = signal<DesignSpec | null>(null);

  // AI marketing
  aiLoading = signal(false);
  aiResult = signal('');
  aiTool = signal<AiTool | null>(null);
  copied = signal(false);

  registrations = signal<Registration[]>([]);
  regsLoading = signal(false);

  // Registrations filters
  regSearch = signal('');
  regStatusFilter = signal('all');
  regSortBy = signal('createdAt');
  regSortOrder = signal<'asc' | 'desc'>('desc');
  expandedRegIds = signal<Set<string>>(new Set());
  private regSearchDebounce: ReturnType<typeof setTimeout> | null = null;

  // Impulsadores
  impulsadores = signal<Impulsador[]>([]);
  impulsadoresLoading = signal(false);
  impulsadorLinkCopiedId = signal('');
  userImpulsadores = computed(() => this.impulsadores().filter(i => i.type === 'user'));
  externalImpulsadores = computed(() => this.impulsadores().filter(i => i.type === 'external'));

  showExternalForm = signal(false);
  savingExternal = signal(false);
  externalForm: { name: string; phone: string; email: string } = { name: '', phone: '', email: '' };

  // Check-in QR scan
  scannerOpen = signal(false);
  scanning = signal(false);
  lastScanResult = signal<{ name: string; impulsadorName: string | null; alreadyCheckedIn: boolean } | null>(null);
  private html5Qrcode: import('html5-qrcode').Html5Qrcode | null = null;

  private role = computed(() => this.auth.currentUser()?.role ?? '');
  canManage = computed(() => ['TENANT_ADMIN', 'MANAGER'].includes(this.role()));

  aiResultLabel = computed(() => {
    const map: Record<AiTool, string> = {
      copy: 'Copy generado', social: 'Post para redes', hashtags: 'Hashtags', email: 'Email de invitación',
    };
    return this.aiTool() ? map[this.aiTool()!] : '';
  });

  filteredRegistrations = computed(() => {
    const search = this.regSearch().toLowerCase();
    const regs = this.registrations();
    if (!search) return regs;
    return regs.filter(r =>
      r.name.toLowerCase().includes(search) ||
      r.email.toLowerCase().includes(search) ||
      r.ticketCode.toLowerCase().includes(search)
    );
  });

  checkedInCount = computed(() => this.registrations().filter(r => r.checkedIn).length);
  totalAttendees = computed(() => this.registrations().reduce((acc, r) => acc + r.partySize, 0));
  attendanceRate = computed(() => {
    if (this.totalAttendees() === 0) return 0;
    return Math.round((this.checkedInCount() / this.totalAttendees()) * 100);
  });
  estimatedRevenue = computed(() => {
    const p = this.event()?.price || 0;
    return this.totalAttendees() * p;
  });

  impulsadorStats = computed<ImpulsadorStat[]>(() => {
    const map = new Map<string, ImpulsadorStat>();
    for (const r of this.registrations()) {
      const key = r.impulsadorName || 'Directo';
      const stat = map.get(key) ?? { name: key, registrations: 0, attendees: 0, checkedIn: 0 };
      stat.registrations += 1;
      stat.attendees += r.partySize;
      if (r.checkedIn) stat.checkedIn += 1;
      map.set(key, stat);
    }
    return [...map.values()].sort((a, b) => b.attendees - a.attendees);
  });

  maxImpulsadorAttendees = computed(() => Math.max(1, ...this.impulsadorStats().map(s => s.attendees)));

  form = this.fb.group({
    title:       ['', Validators.required],
    description: [''],
    date:        ['', Validators.required],
    startTime:   [''],
    endTime:     [''],
    price:       [0],
    capacity:    [0],
    status:      ['draft'],
  });

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id === 'new') {
        this.isNew.set(true);
        this.localId.set(this.route.snapshot.queryParamMap.get('localId'));
        this.loading.set(false);
        if (!this.localId()) {
          this.toast.error('Local no especificado para el evento');
          this.router.navigate(['/events']);
        }
      } else if (id) {
        this.eventId.set(id);
        this.loadEvent(id);
      }
    });
    const tab = this.route.snapshot.queryParamMap.get('tab') as ActiveTab | null;
    if (tab) this.activeTab.set(tab);
  }

  loadEvent(id: string) {
    this.loading.set(true);
    this.http.get<AppEvent>(`${API}/events/${id}`).subscribe({
      next: (ev) => {
        this.event.set(ev);
        this.previewUrl.set(ev.imageUrl ?? '');
        this.mediaFiles.set(ev.mediaFiles ?? []);
        this.formFields.set(ev.formFields ?? []);
        this.design.set(ev.invitationDesign ?? null);
        this.form.patchValue({
          title: ev.title, description: ev.description ?? '',
          date: ev.date ? ev.date.slice(0, 10) : '',
          startTime: ev.startTime ?? '', endTime: ev.endTime ?? '',
          price: ev.price, capacity: ev.capacity, status: ev.status,
        });
        this.loading.set(false);
        this.loadRegistrations(id);
      },
      error: () => {
        this.toast.error('No se pudo cargar el evento');
        this.router.navigate(['/events']);
      }
    });
  }

  loadRegistrations(id?: string) {
    const eventId = id ?? this.eventId();
    if (!eventId) return;
    this.regsLoading.set(true);
    const params: Record<string, string> = {
      sortBy: this.regSortBy(),
      sortOrder: this.regSortOrder(),
    };
    if (this.regStatusFilter() !== 'all') params['status'] = this.regStatusFilter();
    if (this.regSearch().trim()) params['search'] = this.regSearch().trim();

    this.http.get<Registration[]>(`${API}/events/${eventId}/registrations`, { params }).subscribe({
      next: (r) => { this.registrations.set(r); this.regsLoading.set(false); },
      error: () => this.regsLoading.set(false),
    });
  }

  onRegSearchChange(value: string) {
    this.regSearch.set(value);
    if (this.regSearchDebounce) clearTimeout(this.regSearchDebounce);
    this.regSearchDebounce = setTimeout(() => this.loadRegistrations(), 350);
  }

  onRegFilterChange() {
    this.loadRegistrations();
  }

  setSortBy(field: string) {
    if (this.regSortBy() === field) {
      this.regSortOrder.set(this.regSortOrder() === 'asc' ? 'desc' : 'asc');
    } else {
      this.regSortBy.set(field);
      this.regSortOrder.set('asc');
    }
    this.loadRegistrations();
  }

  toggleExpandReg(id: string) {
    this.expandedRegIds.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  downloadExcel() {
    const regs = this.registrations();
    const fields = this.formFields();
    const headers = ['Ticket', 'Nombre', 'Email', 'Teléfono', 'Personas', 'Impulsador', 'Estado', 'Check-in', 'Fecha Registro',
      ...fields.map(f => f.label)];

    const rows = regs.map(r => [
      r.ticketCode,
      r.name,
      r.email,
      r.phone ?? '',
      r.partySize,
      r.impulsadorName ?? 'Directo',
      r.status === 'confirmed' ? 'Confirmado' : 'Cancelado',
      r.checkedIn ? 'Sí' : 'No',
      new Date(r.createdAt).toLocaleDateString('es-PE'),
      ...fields.map(f => r.customFields?.[f.id] ?? ''),
    ]);

    const BOM = '﻿';
    const csv = BOM + [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asistentes_${this.event()?.title ?? 'evento'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success('Archivo descargado');
  }

  // ── Cover image ───────────────────────────────────────────────────────────

  onFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    const fd = new FormData();
    fd.append('file', file);
    this.http.post<{ url: string }>(`${API}/upload?folder=events`, fd).subscribe({
      next: (res) => { this.previewUrl.set(res.url); this.uploading.set(false); (e.target as HTMLInputElement).value = ''; },
      error: (err) => { this.toast.error(err.error?.message || 'Error al subir imagen'); this.uploading.set(false); },
    });
  }

  clearImage() { this.previewUrl.set(''); }

  // ── Media files (multi-upload) ────────────────────────────────────────────

  async onMediaFilesChange(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    if (!files.length) return;
    this.uploadingMedia.set(true);
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await firstValueFrom(
          this.http.post<{ url: string; key: string; contentType: string; size: number }>(`${API}/upload?folder=events`, fd)
        );
        this.mediaFiles.update(prev => [...prev, {
          url: res.url,
          key: res.key,
          name: file.name,
          mimeType: res.contentType,
          size: file.size,
        }]);
      } catch (err: unknown) {
        const e = err as { error?: { message?: string } };
        this.toast.error(e.error?.message || `Error al subir ${file.name}`);
      }
    }
    this.uploadingMedia.set(false);
    (event.target as HTMLInputElement).value = '';
  }

  removeMedia(file: MediaFile) {
    this.mediaFiles.update(prev => prev.filter(f => f.url !== file.url));
  }

  isImage(mimeType: string): boolean { return mimeType.startsWith('image/'); }
  isVideo(mimeType: string): boolean { return mimeType.startsWith('video/'); }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  onDesignChange(d: DesignSpec) { this.design.set(d); }

  // ── Save ──────────────────────────────────────────────────────────────────

  saveEvent() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const val = this.form.value;
    const body = this.isNew()
      ? { ...val, localId: this.localId(), imageUrl: this.previewUrl() || undefined, mediaFiles: this.mediaFiles(), formFields: this.formFields(), ...(this.design() ? { invitationDesign: this.design() } : {}) }
      : { ...val, imageUrl: this.previewUrl() || undefined, mediaFiles: this.mediaFiles(), formFields: this.formFields() };

    const req = this.isNew()
      ? this.http.post<AppEvent>(`${API}/events`, body)
      : this.http.patch<AppEvent>(`${API}/events/${this.eventId()}`, body);

    req.subscribe({
      next: (savedEv) => {
        this.toast.success(this.isNew() ? 'Evento creado' : 'Evento actualizado');
        this.saving.set(false);
        if (this.isNew()) {
          this.router.navigate(['/events', savedEv._id], { queryParams: { tab: 'invitation' } });
        } else {
          this.event.set(savedEv);
        }
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Error al guardar');
        this.saving.set(false);
      },
    });
  }

  // ── Form field builder ────────────────────────────────────────────────────

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

  hasCustomFields(cf: Record<string, string>): boolean {
    return Object.values(cf).some(v => v);
  }

  private genId(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  // ── AI marketing ──────────────────────────────────────────────────────────

  private readonly AI_ENDPOINTS: Record<AiTool, string> = {
    copy: 'generate-copy', social: 'generate-social', hashtags: 'generate-hashtags', email: 'generate-email',
  };

  runAI(tool: AiTool) {
    const id = this.eventId();
    if (!id) return;
    this.aiLoading.set(true);
    this.aiTool.set(tool);
    this.aiResult.set('');

    this.http.post<Record<string, unknown>>(
      `${API}/events/${id}/${this.AI_ENDPOINTS[tool]}`, {}
    ).subscribe({
      next: (res) => {
        if (tool === 'copy') {
          const r = res as { title: string; description: string };
          this.form.patchValue({ title: r.title, description: r.description });
          this.saveEvent();
          this.aiResult.set('Título y descripción actualizados con éxito.');
          this.toast.success('Copy generado y aplicado');
        } else if (tool === 'social') {
          const r = res as { instagram: string; whatsapp: string };
          this.aiResult.set(`📸 INSTAGRAM\n${r.instagram}\n\n💬 WHATSAPP\n${r.whatsapp}`);
        } else if (tool === 'hashtags') {
          const r = res as { hashtags: string[] };
          this.aiResult.set(r.hashtags.join(' '));
        } else if (tool === 'email') {
          const r = res as { subject: string; body: string };
          this.aiResult.set(`ASUNTO: ${r.subject}\n\n${r.body}`);
        }
        this.aiLoading.set(false);
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Error al generar con IA');
        this.aiLoading.set(false);
      },
    });
  }

  copyAiResult() {
    void navigator.clipboard.writeText(this.aiResult()).then(() => {
      this.copied.set(true);
      this.toast.success('Copiado al portapapeles');
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  publicUrl(slug: string): string { return `${window.location.origin}/e/${slug}`; }

  doCheckIn(reg: Registration) {
    const id = this.eventId();
    if (!id) return;
    this.checkingInId.set(reg._id);
    this.http.patch<Registration>(`${API}/events/${id}/registrations/${reg._id}/check-in`, {}).subscribe({
      next: (updated) => {
        this.registrations.update(prev => prev.map(r => r._id === updated._id ? updated : r));
        this.toast.success(`Check-in de ${reg.name} completado`);
        this.checkingInId.set(null);
      },
      error: () => {
        this.toast.error('No se pudo realizar el check-in');
        this.checkingInId.set(null);
      }
    });
  }

  // ── Impulsadores ──────────────────────────────────────────────────────────

  loadImpulsadores() {
    const id = this.eventId();
    if (!id) return;
    this.impulsadoresLoading.set(true);
    this.http.get<Impulsador[]>(`${API}/events/${id}/impulsadores`).subscribe({
      next: (list) => { this.impulsadores.set(list); this.impulsadoresLoading.set(false); },
      error: () => { this.impulsadoresLoading.set(false); this.toast.error('No se pudo cargar impulsadores'); },
    });
  }

  toggleImpulsador(imp: Impulsador) {
    const id = this.eventId();
    if (!id) return;
    const current = this.userImpulsadores();
    const nextAssigned = !imp.assigned;
    const sharedWith = current.filter(i => (i._id === imp._id ? nextAssigned : i.assigned)).map(i => i._id);

    this.http.patch<{ sharedWith: string[] }>(`${API}/events/${id}/share`, { sharedWith }).subscribe({
      next: () => {
        this.impulsadores.update(list => list.map(i => i._id === imp._id ? { ...i, assigned: nextAssigned } : i));
        this.toast.success(nextAssigned ? `${imp.name} activado para este evento` : `${imp.name} desactivado`);
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al actualizar impulsador'),
    });
  }

  copyImpulsadorLink(imp: Impulsador) {
    const slug = this.event()?.slug;
    if (!slug || !imp.referralCode) return;
    const url = `${this.publicUrl(slug)}?ref=${imp.referralCode}`;
    void navigator.clipboard.writeText(url).then(() => {
      this.impulsadorLinkCopiedId.set(imp._id);
      this.toast.success('Link copiado al portapapeles');
      setTimeout(() => this.impulsadorLinkCopiedId.set(''), 2000);
    });
  }

  openExternalForm() {
    this.externalForm = { name: '', phone: '', email: '' };
    this.showExternalForm.set(true);
  }

  closeExternalForm() {
    this.showExternalForm.set(false);
  }

  saveExternalImpulsador() {
    if (!this.externalForm.name.trim()) { this.toast.error('El nombre es requerido'); return; }
    this.savingExternal.set(true);
    const body = {
      name: this.externalForm.name.trim(),
      phone: this.externalForm.phone.trim() || undefined,
      email: this.externalForm.email.trim() || undefined,
    };
    this.http.post<{ _id: string; name: string; email?: string; code: string }>(`${API}/impulsadores/external`, body).subscribe({
      next: (created) => {
        this.impulsadores.update(list => [...list, {
          _id: created._id, name: created.name, email: created.email ?? '',
          referralCode: created.code, assigned: true, type: 'external',
        }]);
        this.savingExternal.set(false);
        this.showExternalForm.set(false);
        this.toast.success('Impulsador externo creado');
      },
      error: (err) => {
        this.savingExternal.set(false);
        this.toast.error(err.error?.message || 'Error al crear impulsador');
      },
    });
  }

  async deleteExternalImpulsador(imp: Impulsador) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar impulsador',
      message: `¿Eliminar a "${imp.name}"? Su link dejará de funcionar para nuevos registros.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/impulsadores/external/${imp._id}`).subscribe({
      next: () => {
        this.impulsadores.update(list => list.filter(i => i._id !== imp._id));
        this.toast.success('Impulsador eliminado');
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }

  // ── Check-in por QR ──────────────────────────────────────────────────────

  async openScanner() {
    this.lastScanResult.set(null);
    this.scannerOpen.set(true);
    this.scanning.set(true);
    const { Html5Qrcode } = await import('html5-qrcode');
    setTimeout(async () => {
      try {
        this.html5Qrcode = new Html5Qrcode('qr-reader');
        await this.html5Qrcode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          (decodedText) => this.onQrDecoded(decodedText),
          () => { /* ignore per-frame decode errors */ },
        );
      } catch {
        this.toast.error('No se pudo acceder a la cámara');
        this.scanning.set(false);
      }
    });
  }

  async closeScanner() {
    if (this.html5Qrcode) {
      try { await this.html5Qrcode.stop(); this.html5Qrcode.clear(); } catch { /* already stopped */ }
      this.html5Qrcode = null;
    }
    this.scanning.set(false);
    this.scannerOpen.set(false);
  }

  private scanLocked = false;
  private async onQrDecoded(code: string) {
    if (this.scanLocked) return;
    this.scanLocked = true;
    const id = this.eventId();
    if (!id) { this.scanLocked = false; return; }

    try {
      const res = await firstValueFrom(this.http.patch<Registration & { impulsadorName: string | null; alreadyCheckedIn: boolean }>(
        `${API}/events/${id}/registrations/check-in/by-code`, { code },
      ));
      this.registrations.update(prev => prev.map(r => r._id === res._id ? res : r));
      this.lastScanResult.set({ name: res.name, impulsadorName: res.impulsadorName, alreadyCheckedIn: res.alreadyCheckedIn });
      this.toast.success(res.alreadyCheckedIn ? `${res.name} ya tenía check-in` : `Check-in de ${res.name} completado`);
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      this.toast.error(e.error?.message || 'Código no válido');
    } finally {
      setTimeout(() => { this.scanLocked = false; }, 2000);
    }
  }
}
