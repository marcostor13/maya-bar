import { Component, HostListener, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule, Mail, MessageSquare, CheckCircle2, X, Users, Zap, Edit2,
  DollarSign, RefreshCw, Info, Wand2, Eye, Check, Upload, Paperclip, Smartphone, Search,
  Link2, CalendarClock, LayoutTemplate, TriangleAlert,
} from 'lucide-angular';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastService } from '../../shared/toast';
import { CampaignsApiService } from '../../core/api/campaigns-api.service';
import {
  Campaign, CampaignChannel, CampaignMediaType, CampaignPayload, CampaignTargeting,
  ContactList, PRESET_TAGS, WaTemplate,
} from '../../shared/models/campaign.model';
import { CampaignMediaComponent } from './campaign-media';
import { EmailAccountsApiService } from '../../core/api/email-accounts-api.service';
import {
  EmailTemplateSummary, MessagePreview, MessageTemplate, TemplateVariable, TemplatesApiService,
} from '../../core/api/templates-api.service';
import { VariableChipsComponent, insertAtCursor } from '../templates/variable-chips';
import type { EmailAccount } from '../../shared/models/email.model';
import type { AudiencePreview } from '../../shared/models/campaign.model';

/** Drawer de creación/edición de campaña (email / WhatsApp WAHA / Cloud API). */
/**
 * De dónde sale el valor de cada hueco de la plantilla. El token es lo que se
 * guarda en `templateVars`; el backend lo sustituye por el dato de cada
 * destinatario al enviar. Cadena vacía = texto fijo escrito a mano.
 */
const VAR_SOURCES: { token: string; label: string; sample: string }[] = [
  { token: '{nombre}',   label: 'Nombre del cliente', sample: 'María García' },
  { token: '{email}',    label: 'Email del cliente',  sample: 'maria@email.com' },
  { token: '{telefono}', label: 'Teléfono del cliente', sample: '+51 999 888 777' },
  { token: '',           label: 'Texto fijo…',        sample: '' },
];

@Component({
  selector: 'app-campaign-editor',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, RouterLink, CampaignMediaComponent, VariableChipsComponent],
  template: `
    <div class="overlay" (click)="close()"></div>
    <div class="drawer">
      <div class="drawer-header">
        <h2 class="drawer-title">{{ editingId() ? 'Editar campaña' : 'Nueva campaña' }}</h2>
        <button class="btn btn-icon btn-ghost" (click)="close()">
          <lucide-icon [img]="X" [size]="20"></lucide-icon>
        </button>
      </div>
      <div class="drawer-body">
        @if (formError()) {
          <div class="form-error-box">{{ formError() }}</div>
        }

        <!-- Name -->
        <div class="field">
          <label class="label">Nombre de la campaña *</label>
          <input class="input" [(ngModel)]="form.name" placeholder="Ej: Promo Verano 2026" />
        </div>

        <!-- Channel tabs -->
        <div class="field">
          <label class="label">Canal *</label>
          <div class="channel-tabs">
            <button type="button" [disabled]="!!editingId()" class="channel-tab" [class.active]="form.channel === 'email'" (click)="setChannel('email')">
              <lucide-icon [img]="Mail" [size]="14"></lucide-icon>
              Email
            </button>
            <button type="button" [disabled]="!!editingId()" class="channel-tab" [class.active]="form.channel === 'waha'" (click)="setChannel('waha')">
              <lucide-icon [img]="MessageSquare" [size]="14"></lucide-icon>
              WhatsApp WAHA
            </button>
            <button type="button" [disabled]="!!editingId()" class="channel-tab channel-tab-cloud" [class.active]="form.channel === 'cloudapi'" (click)="setChannel('cloudapi')">
              <lucide-icon [img]="Zap" [size]="14"></lucide-icon>
              Cloud API
            </button>
            <button type="button" [disabled]="!!editingId()" class="channel-tab" [class.active]="form.channel === 'sms'" (click)="setChannel('sms')">
              <lucide-icon [img]="Smartphone" [size]="14"></lucide-icon>
              SMS
            </button>
          </div>
          @if (editingId()) {
            <span class="hint">El canal no se puede cambiar en una campaña ya creada. Crea una nueva para otro canal.</span>
          }
        </div>

        <!-- SMS -->
        @if (form.channel === 'sms') {
          @if (smsStatus(); as sms) {
            @if (!sms.configured) {
              <div class="warn-note">
                <lucide-icon [img]="TriangleAlert" [size]="14"></lucide-icon>
                <span>Aún no hay un proveedor de SMS activo. Configúralo en
                  <a routerLink="/settings">Configuración → SMS</a> para poder enviar.</span>
              </div>
            } @else {
              <div class="info-note">
                <lucide-icon [img]="Info" [size]="13"></lucide-icon>
                Se enviará con {{ sms.name || 'tu proveedor' }}{{ sms.from ? ' desde ' + sms.from : '' }}.
              </div>
            }
          }
          <div class="field">
            <div class="field-head">
              <label class="label">Mensaje *</label>
              @if (channelTemplates().length) {
                <select class="select select-inline" (change)="useMessageTemplate($any($event.target).value); $any($event.target).value = ''"
                  aria-label="Usar una plantilla de mensaje">
                  <option value="">Usar plantilla…</option>
                  @for (t of channelTemplates(); track t._id) { <option [value]="t._id">{{ t.name }}</option> }
                </select>
              }
            </div>
            <app-variable-chips [variables]="variables()" (pick)="insertToken($event, smsBody)" />
            <textarea class="textarea" #smsBody [(ngModel)]="form.body" (ngModelChange)="onBodyChange()" rows="5"
              maxlength="1600" placeholder="Hola {primer_nombre}, tenemos algo para ti: {link}"></textarea>
            @if (smsPreview(); as p) {
              <div class="counter" [class.warn]="p.sms.segments > 1">
                <span>{{ p.sms.length }} caracteres · {{ p.sms.segments }} SMS por destinatario · {{ p.sms.encoding }}</span>
                <span>{{ p.sms.perSegment }} por segmento</span>
              </div>
              @if (p.sms.encoding === 'UCS-2') {
                <div class="warn-note">
                  <lucide-icon [img]="TriangleAlert" [size]="14"></lucide-icon>
                  <span>Estos caracteres reducen cada SMS a 70: {{ p.sms.unicodeChars.join(' ') }}</span>
                </div>
              }
              @if (p.unknown.length) {
                <div class="warn-note">
                  <lucide-icon [img]="TriangleAlert" [size]="14"></lucide-icon>
                  <span>Variables que no existen: {{ p.unknown.join(', ') }}</span>
                </div>
              }
              <div class="sms-bubble">{{ p.body || '…' }}</div>
            }
          </div>
        }

        <!-- Email: subject + editor -->
        @if (form.channel === 'email') {
          <div class="field">
            <label class="label">Asunto del email</label>
            <input class="input" #subjectInput [(ngModel)]="form.subject" placeholder="Ej: ¡Oferta exclusiva para ti!" />
            <app-variable-chips [variables]="variables()" (pick)="insertToken($event, subjectInput, 'subject')" />
          </div>

          <div class="field">
            <label class="label">Enviar desde</label>
            <select class="select" [(ngModel)]="form.senderAccountId">
              <option value="">Remitente de la plataforma</option>
              @for (a of emailAccounts(); track a._id) {
                <option [value]="a._id">{{ a.label || a.email }} · {{ a.email }}</option>
              }
            </select>
            @if (!emailAccounts().length) {
              <span class="hint">Conecta un buzón en <a routerLink="/settings">Configuración → Correo</a> para enviar con tu propia dirección.</span>
            }
          </div>

          <div class="field">
            <div class="field-head">
              <label class="label">Diseño</label>
              <a class="btn btn-ghost btn-sm" routerLink="/plantillas-email">
                <lucide-icon [img]="LayoutTemplate" [size]="13"></lucide-icon>
                Gestionar plantillas
              </a>
            </div>
            <select class="select" [(ngModel)]="form.emailTemplateId" (ngModelChange)="onEmailTemplateChange()">
              <option value="">Texto simple (sin plantilla)</option>
              @for (t of emailTemplates(); track t._id) { <option [value]="t._id">{{ t.name }}</option> }
            </select>
            @if (form.emailTemplateId) {
              <div class="template-actions">
                <button type="button" class="btn btn-secondary btn-sm" (click)="previewEmailTemplate()" [disabled]="templatePreviewLoading()">
                  <lucide-icon [img]="Eye" [size]="13"></lucide-icon>
                  {{ templatePreviewLoading() ? 'Cargando…' : 'Vista previa' }}
                </button>
                <span class="hint">Se envía el diseño tal como esté guardado al pulsar "Enviar".</span>
              </div>
            }
          </div>
        }

        @if (form.channel === 'email' && !form.emailTemplateId) {
          <div class="field">
            <div class="email-toolbar">
              <div class="email-mode-tabs">
                <button type="button" class="email-tab" [class.active]="emailMode() === 'manual'" (click)="emailMode.set('manual')">
                  <lucide-icon [img]="Edit2" [size]="13"></lucide-icon>
                  Manual
                </button>
                <button type="button" class="email-tab" [class.active]="emailMode() === 'ai'" (click)="emailMode.set('ai')">
                  <lucide-icon [img]="Wand2" [size]="13"></lucide-icon>
                  Generar con IA
                </button>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" (click)="openEmailPreview()">
                <lucide-icon [img]="Eye" [size]="13"></lucide-icon>
                Vista previa
              </button>
            </div>

            @if (emailMode() === 'ai') {
              <div class="ai-box">
                <div style="display:flex;flex-direction:column;gap:4px">
                  <label class="label" style="font-size:12px">¿Sobre qué es esta campaña?</label>
                  <textarea class="textarea" [(ngModel)]="aiTopic" rows="3"
                    placeholder="Ej: Promo de verano — 20% descuento en cócteles durante enero, para clientes frecuentes..."></textarea>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <select class="select" [(ngModel)]="aiTone" style="flex:1;min-width:160px">
                    <option value="amigable">Amigable y cercano</option>
                    <option value="profesional">Profesional</option>
                    <option value="exclusivo">Exclusivo / premium</option>
                    <option value="urgente">Urgente / llamada a acción</option>
                  </select>
                  <button type="button" class="btn btn-primary btn-sm" (click)="generateEmailWithAI()"
                    [disabled]="aiGenerating() || !aiTopic.trim()">
                    <lucide-icon [img]="Wand2" [size]="13" [class.spin]="aiGenerating()"></lucide-icon>
                    {{ aiGenerating() ? 'Generando…' : 'Generar email' }}
                  </button>
                </div>
              </div>
            }

            <label class="label">Cuerpo del email *</label>
            @if (channelTemplates().length) {
              <select class="select select-inline" (change)="useMessageTemplate($any($event.target).value); $any($event.target).value = ''"
                aria-label="Usar una plantilla de mensaje">
                <option value="">Usar plantilla de mensaje…</option>
                @for (t of channelTemplates(); track t._id) { <option [value]="t._id">{{ t.name }}</option> }
              </select>
            }
            <app-variable-chips [variables]="variables()" (pick)="insertToken($event, emailBody)" />
            <textarea class="textarea" #emailBody [(ngModel)]="form.body" (ngModelChange)="onBodyChange()" rows="8"
              placeholder="Hola {nombre}, tenemos algo especial para ti..."></textarea>
          </div>
        }

        <!-- Cloud API: Template section -->
        @if (form.channel === 'cloudapi') {
          <div class="field">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <label class="label" style="margin:0">Plantilla aprobada</label>
              <button type="button" class="btn btn-ghost btn-sm" (click)="syncTemplates()" [disabled]="templatesLoading()">
                <lucide-icon [img]="RefreshCw" [size]="12" [class.spin]="templatesLoading()"></lucide-icon>
                Sincronizar
              </button>
            </div>
            @if (templatesLoading()) {
              <div style="text-align:center;padding:16px;color:var(--color-text-muted);font-size:13px">Cargando plantillas...</div>
            } @else if (templates().length === 0) {
              <div class="info-note">
                <lucide-icon [img]="Info" [size]="13"></lucide-icon>
                No hay plantillas. Ve a Configuración → Plantillas WhatsApp y sincroniza desde Meta.
              </div>
            } @else {
              <div class="templates-picker">
                @for (t of templates(); track t._id) {
                  <div class="tpl-card" [class.selected]="form.templateName === t.name" (click)="selectTemplate(t)">
                    <div class="tpl-card-head">
                      <span class="tpl-card-name">{{ t.name }}</span>
                      <span class="tpl-card-status tpl-status-{{ t.status.toLowerCase() }}">{{ t.status }}</span>
                    </div>
                    <div class="tpl-card-body">{{ t.body.substring(0,100) }}{{ t.body.length > 100 ? '…' : '' }}</div>
                    <div class="tpl-card-meta">{{ t.language }} · {{ t.category }}</div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Template vars -->
          @if (templateVarCount() > 0) {
            <div class="field">
              <label class="label">Variables de la plantilla</label>
              <div class="var-help">
                Elige qué dato del contacto se inserta en cada hueco. Se reemplaza
                por el valor de cada destinatario al enviar.
              </div>
              @for (i of varIndexes(); track i) {
                <div class="var-row">
                  <span class="var-tag">{{ '{{' + (i+1) + '}}' }}</span>
                  <select class="select" [ngModel]="varSourceOf(i)" [ngModelOptions]="{standalone:true}"
                    (ngModelChange)="setVarSource(i, $event)">
                    @for (src of varSources; track src.token) {
                      <option [value]="src.token">{{ src.label }}</option>
                    }
                  </select>
                  @if (varSourceOf(i) === '') {
                    <input class="input" [(ngModel)]="form.templateVars[i]"
                      [ngModelOptions]="{standalone:true}"
                      [placeholder]="'Texto para ' + '{{' + (i+1) + '}}'" />
                  } @else {
                    <span class="var-preview">Ej.: {{ varPreview(i) }}</span>
                  }
                </div>
              }
            </div>
          }

          <!-- Cabecera multimedia exigida por la plantilla -->
          @if (headerMediaFormat(); as fmt) {
            <div class="field">
              <label class="label">{{ headerLabel() }} de la cabecera *</label>
              <div class="var-help">
                Esta plantilla se aprobó con una cabecera de tipo {{ fmt }}. WhatsApp
                exige enviarla en cada mensaje.
              </div>
              @if (headerPreviewUrl(); as url) {
                <div class="header-media-card">
                  @if (fmt === 'IMAGE') {
                    <img [src]="url" alt="Cabecera" class="header-thumb" />
                  } @else {
                    <div class="header-thumb header-thumb-file">
                      <lucide-icon [img]="Paperclip" [size]="18"></lucide-icon>
                    </div>
                  }
                  <div class="header-media-info">
                    <span class="header-media-ok">
                      <lucide-icon [img]="Check" [size]="13"></lucide-icon>
                      {{ form.mediaUrl ? 'Archivo propio de esta campaña' : 'Imagen de ejemplo de la plantilla' }}
                    </span>
                    <div class="header-media-actions">
                      <label class="btn btn-secondary btn-sm" [class.disabled]="uploadingHeader()">
                        <input type="file" [accept]="headerAccept()" hidden
                          (change)="onHeaderFile($event)" [disabled]="uploadingHeader()" />
                        <lucide-icon [img]="Upload" [size]="13"></lucide-icon>
                        {{ uploadingHeader() ? 'Subiendo…' : (form.mediaUrl ? 'Cambiar' : 'Usar otro') }}
                      </label>
                      @if (form.mediaUrl) {
                        <button type="button" class="btn btn-ghost btn-sm" (click)="clearHeaderFile()">
                          <lucide-icon [img]="X" [size]="13"></lucide-icon>
                          Quitar
                        </button>
                      }
                    </div>
                  </div>
                </div>
              } @else {
                <label class="upload-zone" [class.uploading]="uploadingHeader()">
                  <input type="file" [accept]="headerAccept()" hidden
                    (change)="onHeaderFile($event)" [disabled]="uploadingHeader()" />
                  <lucide-icon [img]="Upload" [size]="20"></lucide-icon>
                  <span>{{ uploadingHeader() ? 'Subiendo…' : 'Haz clic para subir ' + headerLabel().toLowerCase() }}</span>
                </label>
                <div class="info-note" style="margin-top:8px">
                  <lucide-icon [img]="Info" [size]="13"></lucide-icon>
                  Sin este archivo WhatsApp rechazará el envío.
                </div>
              }
            </div>
          }

          <!-- Pricing preview -->
          @if (form.templateName && selectedTemplate()) {
            <div class="pricing-box">
              <lucide-icon [img]="DollarSign" [size]="16" style="color:#059669;flex-shrink:0"></lucide-icon>
              <div>
                <div class="pricing-label">Costo estimado</div>
                <div class="pricing-value">{{ cloudApiPriceEstimate() }}</div>
              </div>
            </div>
          }
        }

        <!-- Body: waha or cloud without template (email handled above) -->
        @if (form.channel !== 'email' && form.channel !== 'sms' && (form.channel !== 'cloudapi' || !form.templateName)) {
          <div class="field">
            <label class="label">{{ form.channel === 'cloudapi' ? 'Mensaje (libre, solo dentro de ventana 24h)' : 'Mensaje *' }}</label>
            @if (channelTemplates().length) {
              <select class="select select-inline" (change)="useMessageTemplate($any($event.target).value); $any($event.target).value = ''"
                aria-label="Usar una plantilla de mensaje">
                <option value="">Usar plantilla de mensaje…</option>
                @for (t of channelTemplates(); track t._id) { <option [value]="t._id">{{ t.name }}</option> }
              </select>
            }
            <app-variable-chips [variables]="waVariables()" (pick)="insertToken($event, waBody)" />
            <textarea class="textarea" #waBody [(ngModel)]="form.body" rows="5"
              placeholder="Hola {nombre}, tenemos algo especial para ti..."></textarea>
          </div>
        }

        <!-- Media (waha: full tabs · email: image/video) -->
        @if (form.channel !== 'cloudapi' && form.channel !== 'sms' && !form.emailTemplateId) {
          <app-campaign-media [channel]="form.channel" [(mediaUrl)]="form.mediaUrl" [(mediaType)]="form.mediaType" />
        }

        @if (form.channel === 'email' || form.channel === 'sms') {
          <div class="field">
            <label class="label">
              <lucide-icon [img]="Link2" [size]="13"></lucide-icon>
              Link con seguimiento
            </label>
            <input class="input" [(ngModel)]="form.linkUrl" placeholder="https://tu-sitio.com/oferta" />
            <span class="hint">
              Cada destinatario recibe su propio link corto donde escribas la variable "Link corto",
              y verás quién hizo clic. Déjalo vacío si no usas link.
            </span>
            @if (shortDomains().length) {
              <select class="select" [(ngModel)]="form.linkDomain" aria-label="Dominio del link corto">
                <option value="">Dominio predeterminado</option>
                @for (d of shortDomains(); track d) { <option [value]="d">{{ d }}</option> }
              </select>
            }
          </div>

          <div class="field">
            <label class="label">
              <lucide-icon [img]="CalendarClock" [size]="13"></lucide-icon>
              Programar envío
            </label>
            <input class="input" type="datetime-local" [(ngModel)]="form.scheduledAt" />
            <span class="hint">Vacío = se envía en cuanto pulses "Enviar". Con fecha, queda programada.</span>
          </div>
        }

        <!-- Targeting -->
        <div class="field">
          <label class="label">Destinatarios</label>
          <div class="targeting-tabs">
            <button type="button" class="targeting-tab" [class.active]="form.targeting === 'all'" (click)="setTargeting('all')">Todos los clientes</button>
            <button type="button" class="targeting-tab" [class.active]="form.targeting === 'tags'" (click)="setTargeting('tags')">Por etiquetas</button>
            <button type="button" class="targeting-tab" [class.active]="form.targeting === 'lists'" (click)="setTargeting('lists')">Por listas</button>
            <button type="button" class="targeting-tab" [class.active]="form.targeting === 'contacts'" (click)="setTargeting('contacts')">Elegir contactos</button>
          </div>

          @if (form.targeting === 'contacts') {
            <div class="picker">
              <div class="picker-search">
                <lucide-icon [img]="Search" [size]="14"></lucide-icon>
                <input class="input" placeholder="Buscar por nombre, email, teléfono o etiqueta"
                  [ngModel]="contactQuery()" (ngModelChange)="contactQuery.set($event)" />
              </div>
              @if (contactsLoading()) {
                <div class="picker-empty">Cargando contactos…</div>
              } @else if (!contactResults().length) {
                <div class="picker-empty">Ningún contacto coincide.</div>
              } @else {
                <label class="picker-all">
                  <input type="checkbox" [checked]="allContactsShownSelected()" (change)="toggleShownContacts()" />
                  <span>Seleccionar los {{ contactResults().length }} que se ven</span>
                  <span class="picker-count">{{ selectedContactIds().length }} elegidos</span>
                </label>
                <div class="picker-list">
                  @for (c of contactResults(); track c._id) {
                    <label class="picker-row" [class.selected]="selectedContactIds().includes(c._id)">
                      <input type="checkbox" [checked]="selectedContactIds().includes(c._id)" (change)="toggleContact(c._id)" />
                      <span class="picker-name">{{ c.name }}</span>
                      <span class="picker-sub">{{ form.channel === 'email' ? (c.email || 'sin email') : (c.phone || 'sin teléfono') }}</span>
                    </label>
                  }
                </div>
                @if (contactsHidden() > 0) {
                  <div class="picker-empty">Hay {{ contactsHidden() }} más: afina la búsqueda.</div>
                }
              }
            </div>
          }

          @if (form.targeting === 'tags') {
            <div class="tag-chips" style="margin-top:12px">
              @for (tag of PRESET_TAGS; track tag) {
                <button type="button" class="tag-chip" [class.selected]="isTagSelected(tag)" (click)="toggleTag(tag)">{{ tag }}</button>
              }
            </div>
          }

          @if (form.targeting === 'lists') {
            <div class="lists-selector">
              @if (availableLists().length === 0) {
                <div style="font-size:13px;color:var(--color-text-muted);padding:12px;text-align:center">
                  No hay listas. <a routerLink="/lists" style="color:var(--color-brand)">Crear lista</a>
                </div>
              } @else {
                @for (l of availableLists(); track l._id) {
                  <label class="list-option" [class.selected]="isListSelected(l._id)">
                    <input type="checkbox" [checked]="isListSelected(l._id)" (change)="toggleList(l._id)" style="display:none" />
                    <div class="list-dot" [style.background]="l.color"></div>
                    <div style="flex:1">
                      <div style="font-weight:600;font-size:13px">{{ l.name }}</div>
                      <div style="font-size:11px;color:var(--color-text-muted)">{{ l.type === 'dynamic' ? 'Dinámica' : 'Estática' }} · {{ l.memberCount }} miembros</div>
                    </div>
                    @if (isListSelected(l._id)) {
                      <lucide-icon [img]="CheckCircle2" [size]="16" style="color:var(--color-brand)"></lucide-icon>
                    }
                  </label>
                }
              }
            </div>
          }
        </div>

        @if (previewCount() !== null) {
          <div class="preview-count-box">
            <lucide-icon [img]="Users" [size]="16"></lucide-icon>
            <span>{{ previewLabel() }}</span>
          </div>
        }
      </div>

      @if (templatePreviewDoc(); as doc) {
        <div class="tpl-preview-overlay" (click)="templatePreviewDoc.set(null)" role="dialog" aria-modal="true" aria-label="Vista previa de la plantilla">
          <div class="tpl-preview" (click)="$event.stopPropagation()">
            <div class="tpl-preview-head">
              <strong>Vista previa</strong>
              <button class="btn btn-icon btn-ghost" (click)="templatePreviewDoc.set(null)" aria-label="Cerrar">
                <lucide-icon [img]="X" [size]="18"></lucide-icon>
              </button>
            </div>
            <iframe class="tpl-preview-frame" title="Vista previa del correo" sandbox="" [srcdoc]="doc"></iframe>
          </div>
        </div>
      }
      <div class="drawer-footer">
        <button class="btn btn-ghost" (click)="close()">Cancelar</button>
        <button class="btn btn-primary" (click)="save()" [disabled]="saving()">
          {{ saving() ? 'Guardando...' : 'Guardar borrador' }}
        </button>
      </div>
    </div>

    <!-- Email preview modal -->
    @if (emailPreviewOpen()) {
      <div class="overlay" (click)="emailPreviewOpen.set(false)" style="z-index:200">
        <div class="email-preview-modal" (click)="$event.stopPropagation()">
          <div class="email-preview-header">
            <div style="min-width:0;flex:1">
              <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Asunto</div>
              <div style="font-size:15px;font-weight:700;color:var(--color-text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                {{ form.subject || '(sin asunto)' }}
              </div>
            </div>
            <button class="btn btn-icon btn-ghost" (click)="emailPreviewOpen.set(false)">
              <lucide-icon [img]="X" [size]="20"></lucide-icon>
            </button>
          </div>
          <div class="email-preview-scroll">
            <div [innerHTML]="emailPreviewHtml()"></div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0;
      background: rgba(15,23,42,.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .drawer {
      position: fixed; top: 0; right: 0; height: 100vh; width: 520px;
      background: var(--color-white); box-shadow: var(--shadow-lg);
      display: flex; flex-direction: column; z-index: 101;
      animation: slideIn var(--transition-spring);
    }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 28px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
    .drawer-title { font-family: var(--font-heading); font-size: 18px; font-weight: 700; margin: 0; }
    .drawer-body { flex: 1; overflow-y: auto; padding: 24px 28px; display: flex; flex-direction: column; gap: 20px; }
    .drawer-footer { padding: 20px 28px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 12px; flex-shrink: 0; }

    .field { display: flex; flex-direction: column; gap: 6px; }
    .channel-tab:disabled { opacity:.55; cursor:not-allowed; }
    .field-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .select-inline { width:auto; max-width:220px; padding-top:6px; padding-bottom:6px; font-size:12px; }
    .hint { font-size:11px; color:var(--color-text-muted); }
    .hint a, .warn-note a { color:var(--color-brand); }
    .label lucide-icon { vertical-align:-2px; margin-right:4px; }
    .warn-note { display:flex; gap:8px; align-items:flex-start; padding:10px 12px; border-radius:var(--radius-md);
      background:var(--color-bg-light); border:1px solid var(--color-warning); color:var(--color-text-main); font-size:12px; }
    .warn-note lucide-icon { color:var(--color-warning); flex-shrink:0; margin-top:1px; }
    .counter { display:flex; justify-content:space-between; font-size:12px; color:var(--color-text-muted); }
    .counter.warn { color:var(--color-warning); }
    .sms-bubble { align-self:flex-start; max-width:92%; background:var(--color-bg-app); border-radius:var(--radius-md);
      padding:10px 14px; font-size:13px; white-space:pre-wrap; overflow-wrap:anywhere; }
    .template-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:4px; }
    .picker { margin-top:12px; border:1px solid var(--color-border); border-radius:var(--radius-md); padding:12px; }
    .picker-search { display:flex; align-items:center; gap:8px; color:var(--color-text-muted); margin-bottom:8px; }
    .picker-search .input { flex:1; }
    .picker-all { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--color-text-muted); padding:6px 4px; cursor:pointer; }
    .picker-count { margin-left:auto; font-weight:600; color:var(--color-brand); }
    .picker-list { max-height:240px; overflow-y:auto; display:flex; flex-direction:column; }
    .picker-row { display:flex; align-items:center; gap:8px; padding:8px 4px; font-size:13px; cursor:pointer;
      border-top:1px solid var(--color-border); }
    .picker-row.selected { background:var(--color-brand-light); }
    .picker-name { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .picker-sub { margin-left:auto; font-size:12px; color:var(--color-text-muted); white-space:nowrap; }
    .picker-empty { font-size:12px; color:var(--color-text-muted); text-align:center; padding:12px; }
    .tpl-preview-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px);
      display:flex; align-items:center; justify-content:center; z-index:120; }
    .tpl-preview { width:calc(100% - 48px); max-width:720px; height:calc(100vh - 96px); background:var(--color-white);
      border-radius:var(--radius-lg); box-shadow:var(--shadow-lg); display:flex; flex-direction:column; overflow:hidden; }
    .tpl-preview-head { display:flex; align-items:center; justify-content:space-between; padding:14px 20px;
      border-bottom:1px solid var(--color-border); }
    .tpl-preview-frame { flex:1; width:100%; border:0; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .form-error-box { background: #FEF2F2; border: 1px solid #FECACA; color: var(--color-error); border-radius: var(--radius-lg); padding: 12px 16px; font-size: 14px; }

    /* Channel tabs */
    .channel-tabs { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-pill); overflow: hidden; }
    .channel-tab {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px 12px; border: none; background: transparent;
      font-size: 13px; font-weight: 600; color: var(--color-text-muted);
      cursor: pointer; transition: all var(--transition-fast);
    }
    .channel-tab:hover { background: var(--color-bg-app); color: var(--color-text-main); }
    .channel-tab.active { background: var(--color-brand); color: #fff; }
    .channel-tab-cloud.active { background: #7C3AED; }

    /* Info note */
    .info-note {
      display: flex; align-items: flex-start; gap: 7px;
      padding: 10px 12px; background: #F0F9FF; border: 1px solid #BAE6FD;
      border-radius: var(--radius-lg); font-size: 12px; color: #0369A1; line-height: 1.5;
    }

    /* Template picker */
    .templates-picker { display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; }
    .tpl-card {
      padding: 12px 14px; border: 1.5px solid var(--color-border);
      border-radius: var(--radius-lg); cursor: pointer; transition: all var(--transition-fast);
    }
    .tpl-card:hover { border-color: var(--color-brand); background: var(--color-brand-light); }
    .tpl-card.selected { border-color: var(--color-brand); background: var(--color-brand-light); }
    .tpl-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
    .tpl-card-name { font-size: 13px; font-weight: 700; color: var(--color-text-main); font-family: monospace; }
    .tpl-card-body { font-size: 12px; color: var(--color-text-muted); line-height: 1.4; }
    .tpl-card-meta { font-size: 11px; color: var(--color-text-muted); margin-top: 4px; }
    .tpl-card-status {
      font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: var(--radius-pill);
      background: var(--color-bg-app); color: var(--color-text-muted);
    }
    .tpl-status-approved { background: #F0FDF4; color: #15803D; }
    .tpl-status-pending  { background: #FEFCE8; color: #854D0E; }
    .tpl-status-rejected { background: #FEF2F2; color: #DC2626; }

    /* Var tag */
    .var-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
    .var-row .select { flex:1; min-width:190px; }
    .var-row .input { flex:1; min-width:190px; }
    .var-help { font-size:12px; color:var(--color-text-muted); margin-bottom:8px; line-height:1.5; }
    .var-preview { font-size:12px; color:var(--color-text-muted); font-style:italic; }
    .header-media-ok { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600;
      color:var(--color-success); background:#ECFDF5; border-radius:var(--radius-sm); padding:8px 12px; }

    .header-media-card { display:flex; gap:14px; align-items:center; border:1px solid var(--color-border);
      border-radius:var(--radius-lg); padding:12px 14px; }
    .header-thumb { width:64px; height:64px; border-radius:12px; object-fit:cover; flex-shrink:0;
      border:1px solid var(--color-border); }
    .header-thumb-file { display:flex; align-items:center; justify-content:center;
      background:var(--color-bg-app); color:var(--color-text-muted); }
    .header-media-info { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .header-media-ok { display:inline-flex; align-items:center; gap:5px; font-size:12px;
      font-weight:600; color:var(--color-success); }
    .header-media-actions { display:flex; gap:6px; flex-wrap:wrap; }
    .header-media-actions label { cursor:pointer; margin:0; }
    .header-media-actions label.disabled { opacity:.6; pointer-events:none; }
    .upload-zone { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;
      border:1.5px dashed var(--color-border); border-radius:var(--radius-lg); padding:24px;
      cursor:pointer; color:var(--color-text-muted); font-size:13px; transition:border-color var(--transition-fast); }
    .upload-zone:hover { border-color:var(--color-brand); }
    .upload-zone.uploading { opacity:.6; pointer-events:none; }

    .var-tag {
      font-size: 12px; font-weight: 700; font-family: monospace;
      padding: 6px 10px; background: var(--color-bg-app); border: 1px solid var(--color-border);
      border-radius: var(--radius-lg); white-space: nowrap; color: var(--color-brand);
    }

    /* Pricing box */
    .pricing-box {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; background: #F0FDF4; border: 1px solid #BBF7D0;
      border-radius: var(--radius-lg);
    }
    .pricing-label { font-size: 11px; color: #15803D; font-weight: 600; }
    .pricing-value { font-size: 14px; font-weight: 700; color: #15803D; }

    /* Targeting */
    .targeting-tabs { display: flex; border-bottom: 1px solid var(--color-border); }
    .targeting-tab {
      padding: 8px 16px; border: none; background: transparent; color: var(--color-text-muted);
      font-size: 13px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent;
      margin-bottom: -1px; transition: all var(--transition-fast);
    }
    .targeting-tab:hover { color: var(--color-text-main); }
    .targeting-tab.active { color: var(--color-brand); border-bottom-color: var(--color-brand); }

    .lists-selector { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
    .list-option {
      display: flex; align-items: center; gap: 10px; padding: 10px 14px;
      border: 1.5px solid var(--color-border); border-radius: var(--radius-lg);
      cursor: pointer; transition: all var(--transition-fast);
    }
    .list-option:hover { border-color: var(--color-brand); background: var(--color-brand-light); }
    .list-option.selected { border-color: var(--color-brand); background: var(--color-brand-light); }
    .list-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }

    .tag-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag-chip {
      padding: 6px 14px; border-radius: var(--radius-pill); border: 1.5px solid var(--color-border);
      background: var(--color-white); color: var(--color-text-muted);
      font-size: 13px; font-weight: 600; cursor: pointer; transition: all var(--transition-fast);
    }
    .tag-chip.selected { border-color: var(--color-brand); background: var(--color-brand-light); color: var(--color-brand); }

    .preview-count-box {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px; background: #EFF6FF; border: 1px solid #BFDBFE;
      border-radius: var(--radius-lg); font-size: 14px; color: #1D4ED8;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; display: inline-block; }

    /* Email editor */
    .email-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
    .email-mode-tabs { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-pill); overflow: hidden; }
    .email-tab {
      display: flex; align-items: center; gap: 5px; padding: 6px 14px; border: none;
      background: transparent; font-size: 12px; font-weight: 600; color: var(--color-text-muted);
      cursor: pointer; transition: all var(--transition-fast);
    }
    .email-tab:hover { background: var(--color-bg-app); color: var(--color-text-main); }
    .email-tab.active { background: var(--color-brand); color: #fff; }

    .ai-box {
      display: flex; flex-direction: column; gap: 10px;
      padding: 14px 16px; background: #F5F3FF; border: 1px solid #DDD6FE;
      border-radius: var(--radius-lg); margin-bottom: 12px;
    }

    /* Email preview modal */
    .email-preview-modal {
      background: var(--color-white); width: calc(100% - 48px); max-width: 700px;
      max-height: 90vh; border-radius: 24px; overflow: hidden;
      display: flex; flex-direction: column; box-shadow: var(--shadow-lg);
    }
    .email-preview-header {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 20px 24px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
    }
    .email-preview-scroll { flex: 1; overflow-y: auto; background: #f9fafb; }

    @media (max-width: 768px) {
      .drawer { width: 100%; }
      .drawer-header, .drawer-body, .drawer-footer { padding-left: 18px; padding-right: 18px; }
      .channel-tabs { flex-direction: column; border-radius: var(--radius-lg); }
      .channel-tab { width: 100%; padding: 10px 12px; }
      .targeting-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap; }
      .targeting-tab { flex: 0 0 auto; white-space: nowrap; }
      .email-toolbar { flex-wrap: wrap; }
      .email-preview-modal { width: calc(100% - 24px); max-height: 85vh; }
      .email-preview-header { padding: 16px 18px; }
    }

    @media (max-width: 480px) {
      .templates-picker { max-height: 200px; }
      .ai-box select.select { min-width: 0; width: 100%; }
    }
  `],
})
export class CampaignEditorComponent implements OnInit, OnDestroy {
  private api = inject(CampaignsApiService);
  private toast = inject(ToastService);
  private sanitizer = inject(DomSanitizer);
  private templatesApi = inject(TemplatesApiService);
  private emailAccountsApi = inject(EmailAccountsApiService);

  readonly Mail = Mail; readonly MessageSquare = MessageSquare; readonly CheckCircle2 = CheckCircle2;
  readonly X = X; readonly Users = Users; readonly Zap = Zap; readonly Edit2 = Edit2;
  readonly DollarSign = DollarSign; readonly RefreshCw = RefreshCw; readonly Info = Info;
  readonly Check = Check;
  readonly Upload = Upload; readonly Paperclip = Paperclip;
  readonly Wand2 = Wand2; readonly Eye = Eye;
  readonly Smartphone = Smartphone; readonly Search = Search; readonly Link2 = Link2;
  readonly CalendarClock = CalendarClock; readonly LayoutTemplate = LayoutTemplate;
  readonly TriangleAlert = TriangleAlert;
  readonly PRESET_TAGS = PRESET_TAGS;

  readonly CLOUD_PRICES: Record<string, number> = { MARKETING: 0.0625, UTILITY: 0.0175, AUTHENTICATION: 0.0250 };

  /** Campaña a editar; null para crear una nueva. */
  campaign = input<Campaign | null>(null);
  availableLists = input<ContactList[]>([]);
  /** Emitido tras guardar correctamente (el padre recarga y cierra). */
  saved = output<void>();
  /** Emitido al cancelar/cerrar sin guardar. */
  closed = output<void>();

  templates = signal<WaTemplate[]>([]);
  saving = signal(false);
  formError = signal('');
  previewCount = signal<number | null>(null);
  /** Cuántos quedan fuera por estar en la lista de no contactar. */
  previewBlocked = signal(0);
  templatesLoading = signal(false);
  selectedTemplate = signal<WaTemplate | null>(null);
  emailMode = signal<'manual' | 'ai'>('manual');
  emailPreviewOpen = signal(false);
  emailPreviewHtml = signal<SafeHtml>('' as SafeHtml);
  aiGenerating = signal(false);
  aiTopic = '';
  aiTone = 'amigable';

  // Plantillas, variables, remitentes y SMS
  variables = signal<TemplateVariable[]>([]);
  /** WhatsApp libre no pasa por el motor nuevo: sin link corto ni baja. */
  waVariables = computed(() => this.variables().filter(v => !['{link}', '{baja}'].includes(v.token)));
  emailTemplates = signal<EmailTemplateSummary[]>([]);
  messageTemplates = signal<MessageTemplate[]>([]);
  emailAccounts = signal<EmailAccount[]>([]);
  shortDomains = signal<string[]>([]);
  smsStatus = signal<{ configured: boolean; name: string; from: string } | null>(null);
  smsPreview = signal<MessagePreview | null>(null);
  templatePreviewDoc = signal<SafeHtml | null>(null);
  templatePreviewLoading = signal(false);
  audience = signal<AudiencePreview | null>(null);

  // Selección manual de contactos
  contacts = signal<{ _id: string; name: string; email?: string; phone?: string; tags: string[] }[]>([]);
  contactsLoading = signal(false);
  contactQuery = signal('');
  selectedContactIds = signal<string[]>([]);
  private contactMatches = computed(() => {
    const q = this.contactQuery().trim().toLowerCase();
    if (!q) return this.contacts();
    return this.contacts().filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      (c.tags ?? []).some(t => t.toLowerCase().includes(q)),
    );
  });
  contactResults = computed(() => this.contactMatches().slice(0, 150));
  contactsHidden = computed(() => this.contactMatches().length - this.contactResults().length);
  allContactsShownSelected = computed(() => {
    const shown = this.contactResults();
    return shown.length > 0 && shown.every(c => this.selectedContactIds().includes(c._id));
  });

  private smsTimer: ReturnType<typeof setTimeout> | null = null;

  form = {
    name: '',
    channel: 'email' as CampaignChannel,
    subject: '',
    body: '',
    targeting: 'tags' as CampaignTargeting,
    recipientTags: [] as string[],
    listIds: [] as string[],
    mediaUrl: '',
    mediaType: 'image' as CampaignMediaType,
    templateName: '',
    templateLanguage: 'es',
    templateVars: [] as string[],
    emailTemplateId: '',
    senderAccountId: '',
    linkUrl: '',
    linkDomain: '',
    scheduledAt: '',
  };

  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  editingId = computed(() => this.campaign()?._id ?? null);

  previewLabel = computed(() => {
    const n = this.previewCount();
    if (n === null) return '';
    // Los excluidos se dicen en voz alta: si desaparecen sin explicación, el
    // número no cuadra con la lista y nadie se fía de él.
    const blocked = this.previewBlocked();
    const missing = this.audience()?.missing ?? 0;
    const what = this.form.channel === 'email' ? 'email' : 'teléfono';
    const aparte =
      (blocked > 0 ? ` · ${blocked} fuera por no contactar` : '') +
      (missing > 0 ? ` · ${missing} sin ${what}` : '');
    if (n === 0) return `Sin clientes en este segmento${aparte}`;
    return `${n} cliente${n !== 1 ? 's' : ''} recibirán esta campaña${aparte}`;
  });

  templateVarCount = computed(() => {
    const t = this.selectedTemplate();
    if (!t) return 0;
    const matches = t.body.match(/\{\{\d+\}\}/g) ?? [];
    if (matches.length === 0) return 0;
    return Math.max(...matches.map(m => parseInt(m.replace(/\D/g, ''), 10)));
  });

  varIndexes = computed(() => Array.from({ length: this.templateVarCount() }, (_, i) => i));

  readonly varSources = VAR_SOURCES;

  /** Token elegido para el hueco, o '' si es texto fijo. */
  varSourceOf(i: number): string {
    const value = this.form.templateVars[i] ?? '';
    return VAR_SOURCES.some(s => s.token && s.token === value) ? value : '';
  }

  setVarSource(i: number, token: string) {
    // Al pasar a texto fijo se limpia el token para no enviarlo tal cual.
    this.form.templateVars[i] = token || '';
  }

  varPreview(i: number): string {
    const token = this.varSourceOf(i);
    return VAR_SOURCES.find(s => s.token === token)?.sample ?? '';
  }

  /** Formato de la cabecera cuando exige adjuntar un archivo en cada envío. */
  headerMediaFormat = computed(() => {
    const type = this.selectedTemplate()?.headerType?.toUpperCase();
    return type && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(type) ? type : null;
  });

  headerLabel = computed(() => {
    const fmt = this.headerMediaFormat();
    if (fmt === 'VIDEO') return 'Video';
    if (fmt === 'DOCUMENT') return 'Documento';
    return 'Imagen';
  });

  /**
   * Archivo que se enviará como cabecera: el propio de la campaña o el de
   * ejemplo de la plantilla. Método y no `computed`: `form` es un objeto plano,
   * así que una señal derivada no se enteraría de que `mediaUrl` cambió.
   */
  headerPreviewUrl(): string {
    return this.form.mediaUrl || this.selectedTemplate()?.headerMediaUrl || '';
  }

  uploadingHeader = signal(false);

  /** Tipos que acepta el input según el formato con el que se aprobó la plantilla. */
  headerAccept(): string {
    const fmt = this.headerMediaFormat();
    if (fmt === 'VIDEO') return 'video/*';
    if (fmt === 'DOCUMENT') return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
    return 'image/*';
  }

  onHeaderFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.uploadingHeader.set(true);
    this.api.upload(file, file.name).subscribe({
      next: (r) => {
        this.form.mediaUrl = r.url;
        // El tipo acompaña al formato de la cabecera para el envío.
        const fmt = this.headerMediaFormat();
        this.form.mediaType =
          fmt === 'VIDEO' ? 'video' : fmt === 'DOCUMENT' ? 'document' : 'image';
        this.uploadingHeader.set(false);
        this.toast.success('Archivo de cabecera subido');
      },
      error: () => {
        this.uploadingHeader.set(false);
        this.toast.error('No se pudo subir el archivo');
      },
    });
  }

  /** Vuelve a la imagen de ejemplo de la plantilla. */
  clearHeaderFile() {
    this.form.mediaUrl = '';
  }

  cloudApiPriceEstimate = computed(() => {
    const t = this.selectedTemplate();
    const count = this.previewCount() ?? 0;
    if (!t) return '';
    const price = this.CLOUD_PRICES[t.category] ?? 0.0625;
    if (count === 0) return `$${price.toFixed(4)} USD por conversación (${t.category})`;
    return `~$${(count * price).toFixed(2)} USD para ${count} destinatarios · $${price.toFixed(4)}/conversación (${t.category})`;
  });

  ngOnInit() {
    const c = this.campaign();
    if (c) {
      const channel: CampaignChannel =
        c.type === 'email' ? 'email' : c.type === 'sms' ? 'sms' : (c.waProvider === 'cloudapi' ? 'cloudapi' : 'waha');
      this.form = {
        name: c.name,
        channel,
        subject: c.subject ?? '',
        body: c.body,
        targeting: c.targeting ?? 'tags',
        recipientTags: [...(c.recipientTags ?? [])],
        listIds: [...(c.listIds ?? [])],
        mediaUrl: c.mediaUrl ?? '',
        mediaType: c.mediaType ?? 'image',
        templateName: c.templateName ?? '',
        templateLanguage: c.templateLanguage ?? 'es',
        templateVars: [...(c.templateVars ?? [])],
        emailTemplateId: c.emailTemplateId ?? '',
        senderAccountId: c.senderAccountId ?? '',
        linkUrl: c.linkUrl ?? '',
        linkDomain: c.linkDomain ?? '',
        scheduledAt: c.scheduledAt ? this.toLocalInput(new Date(c.scheduledAt)) : '',
      };
      this.selectedContactIds.set([...(c.customerIds ?? [])]);
    }
    this.loadCatalogs();
    if (this.form.targeting === 'contacts') this.loadContacts();
    if (this.form.channel === 'sms') this.onBodyChange();
    this.schedulePreview();
    if (this.form.channel === 'cloudapi') this.loadTemplates();
  }

  ngOnDestroy() {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    if (this.smsTimer) clearTimeout(this.smsTimer);
  }

  /** Catálogos del editor. Si alguno falla, el formulario sigue siendo usable. */
  private loadCatalogs() {
    this.templatesApi.variables().subscribe({ next: v => this.variables.set(v), error: () => {} });
    this.templatesApi.emailTemplates().subscribe({ next: t => this.emailTemplates.set(t), error: () => {} });
    this.templatesApi.messageTemplates().subscribe({ next: t => this.messageTemplates.set(t), error: () => {} });
    this.emailAccountsApi.list().subscribe({
      next: a => this.emailAccounts.set(a.filter(x => x.active !== false)),
      error: () => {},
    });
    this.api.getShortDomains().subscribe({
      next: r => this.shortDomains.set(r.domains.filter(d => d.status === 'active').map(d => d.domain)),
      error: () => {},
    });
    this.api.smsStatus().subscribe({ next: s => this.smsStatus.set(s), error: () => {} });
  }

  private toLocalInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  /** Inserta una variable en el cursor del campo y sincroniza el formulario. */
  insertToken(token: string, el: HTMLTextAreaElement | HTMLInputElement, field: 'body' | 'subject' = 'body') {
    this.form[field] = insertAtCursor(el, token);
    if (field === 'body') this.onBodyChange();
  }

  /** Recalcula caracteres y segmentos del SMS (con retardo). */
  onBodyChange() {
    if (this.form.channel !== 'sms') return;
    if (this.smsTimer) clearTimeout(this.smsTimer);
    this.smsTimer = setTimeout(() => {
      this.templatesApi.previewMessage(this.form.body).subscribe({
        next: p => this.smsPreview.set(p),
        error: () => {},
      });
    }, 300);
  }

  /**
   * Plantillas de mensaje del canal elegido. Método y no `computed`: `form` es
   * un objeto plano y una señal derivada no vería el cambio de canal.
   */
  channelTemplates(): MessageTemplate[] {
    const channel = this.form.channel === 'email' ? 'email' : this.form.channel === 'sms' ? 'sms' : 'whatsapp';
    return this.messageTemplates().filter(t => t.channel === channel);
  }

  useMessageTemplate(id: string) {
    const template = this.messageTemplates().find(t => t._id === id);
    if (!template) return;
    this.form.body = template.body;
    if (template.subject && this.form.channel === 'email' && !this.form.subject.trim()) this.form.subject = template.subject;
    this.onBodyChange();
    this.toast.success('Plantilla aplicada: puedes ajustarla antes de guardar');
  }

  onEmailTemplateChange() {
    const template = this.emailTemplates().find(t => t._id === this.form.emailTemplateId);
    // El asunto de la plantilla solo se propone si aún no hay uno escrito.
    if (template?.subject && !this.form.subject.trim()) this.form.subject = template.subject;
  }

  previewEmailTemplate() {
    if (!this.form.emailTemplateId) return;
    this.templatePreviewLoading.set(true);
    this.templatesApi.emailTemplate(this.form.emailTemplateId).subscribe({
      next: tpl => {
        this.templatePreviewLoading.set(false);
        let html = tpl.html;
        for (const v of this.variables()) {
          const safe = v.example.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          html = html.split(v.token).join(safe);
        }
        // HTML del propio usuario, pintado en un iframe con sandbox vacío.
        this.templatePreviewDoc.set(this.sanitizer.bypassSecurityTrustHtml(html));
      },
      error: (err: { error?: { message?: string } }) => {
        this.templatePreviewLoading.set(false);
        this.toast.error(err.error?.message || 'No se pudo cargar la plantilla');
      },
    });
  }

  // ── Selección manual de contactos ──
  private loadContacts() {
    if (this.contacts().length || this.contactsLoading()) return;
    this.contactsLoading.set(true);
    this.api.getContacts().subscribe({
      next: c => { this.contacts.set(c); this.contactsLoading.set(false); },
      error: () => { this.contactsLoading.set(false); this.toast.error('No se pudieron cargar los contactos'); },
    });
  }

  toggleContact(id: string) {
    this.selectedContactIds.update(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
    this.schedulePreview();
  }

  toggleShownContacts() {
    const shown = this.contactResults().map(c => c._id);
    if (this.allContactsShownSelected()) {
      this.selectedContactIds.update(ids => ids.filter(id => !shown.includes(id)));
    } else {
      this.selectedContactIds.update(ids => [...new Set([...ids, ...shown])]);
    }
    this.schedulePreview();
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.templatePreviewDoc()) { this.templatePreviewDoc.set(null); return; }
    if (this.emailPreviewOpen()) { this.emailPreviewOpen.set(false); return; }
    this.close();
  }

  close() {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.closed.emit();
  }

  loadTemplates() {
    if (this.templatesLoading()) return;
    this.templatesLoading.set(true);
    this.api.getTemplates().subscribe({
      next: (data) => {
        this.templates.set(data);
        this.templatesLoading.set(false);
        if (this.form.templateName && !this.selectedTemplate()) {
          this.selectedTemplate.set(data.find(t => t.name === this.form.templateName) ?? null);
        }
      },
      error: () => this.templatesLoading.set(false),
    });
  }

  syncTemplates() {
    this.templatesLoading.set(true);
    this.api.syncTemplates().subscribe({
      next: (data) => { this.templates.set(data); this.templatesLoading.set(false); this.toast.success(`${data.length} plantilla(s) sincronizadas`); },
      error: (err: { error?: { message?: string } }) => { this.templatesLoading.set(false); this.toast.error(err.error?.message || 'Error al sincronizar'); },
    });
  }

  setChannel(ch: CampaignChannel) {
    if (this.editingId()) return;
    this.form.channel = ch;
    this.form.mediaUrl = '';
    this.form.mediaType = 'image';
    this.form.templateName = '';
    this.form.templateVars = [];
    this.selectedTemplate.set(null);
    if (ch !== 'email') { this.form.emailTemplateId = ''; this.form.senderAccountId = ''; }
    if (ch !== 'email' && ch !== 'sms') { this.form.linkUrl = ''; this.form.scheduledAt = ''; }
    if (ch === 'cloudapi') this.loadTemplates();
    if (ch === 'sms') this.onBodyChange();
    // El recuento depende del canal: email cuenta correos, el resto teléfonos.
    this.schedulePreview();
  }

  selectTemplate(t: WaTemplate) {
    this.form.templateName = t.name;
    this.form.templateLanguage = t.language;
    this.selectedTemplate.set(t);
    const count = Math.max(...(t.body.match(/\{\{\d+\}\}/g) ?? ['{{0}}']).map(m => parseInt(m.replace(/\D/g, ''), 10)));
    const realCount = isFinite(count) ? count : 0;
    // Los huecos nuevos arrancan en el nombre del cliente, que es lo que casi
    // siempre se quiere; los que ya tenían valor se conservan.
    this.form.templateVars = Array.from(
      { length: realCount },
      (_, i) => this.form.templateVars[i] ?? '{nombre}',
    );
  }

  toggleTag(tag: string) {
    const idx = this.form.recipientTags.indexOf(tag);
    if (idx >= 0) this.form.recipientTags.splice(idx, 1);
    else this.form.recipientTags.push(tag);
    this.schedulePreview();
  }
  isTagSelected(tag: string) { return this.form.recipientTags.includes(tag); }

  setTargeting(t: CampaignTargeting) {
    this.form.targeting = t;
    if (t === 'contacts') this.loadContacts();
    this.schedulePreview();
  }

  toggleList(id: string) {
    const idx = this.form.listIds.indexOf(id);
    if (idx >= 0) this.form.listIds.splice(idx, 1);
    else this.form.listIds.push(id);
    this.schedulePreview();
  }
  isListSelected(id: string) { return this.form.listIds.includes(id); }

  private schedulePreview() {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.fetchPreview(), 400);
  }

  private fetchPreview() {
    const f = this.form;
    this.api
      .audiencePreview({
        type: f.channel === 'email' ? 'email' : f.channel === 'sms' ? 'sms' : 'whatsapp',
        targeting: f.targeting,
        recipientTags: f.targeting === 'tags' ? f.recipientTags : [],
        listIds: f.targeting === 'lists' ? f.listIds : [],
        customerIds: f.targeting === 'contacts' ? this.selectedContactIds() : [],
      })
      .subscribe({
        next: r => {
          this.audience.set(r);
          this.previewCount.set(r.reachable);
          this.previewBlocked.set(r.blocked);
        },
        error: () => {},
      });
  }

  generateEmailWithAI() {
    if (!this.aiTopic.trim()) return;
    this.aiGenerating.set(true);
    this.api.generateEmail(this.aiTopic, this.aiTone).subscribe({
      next: (data) => {
        this.form.subject = data.subject;
        this.form.body = data.body;
        this.aiGenerating.set(false);
        this.emailMode.set('manual');
        this.toast.success('Email generado — puedes editarlo antes de guardar');
      },
      error: (err: { error?: { message?: string } }) => {
        this.aiGenerating.set(false);
        this.toast.error(err.error?.message || 'Error al generar con IA');
      },
    });
  }

  openEmailPreview() {
    this.emailPreviewHtml.set(
      this.sanitizer.bypassSecurityTrustHtml(this.buildEmailPreviewHtml()),
    );
    this.emailPreviewOpen.set(true);
  }

  /** Sustituye cada variable por su valor de muestra del catálogo. */
  private withSamples(text: string): string {
    let out = text;
    for (const v of this.variables()) out = out.split(v.token).join(v.example);
    return out;
  }

  private buildEmailPreviewHtml(): string {
    const body = this.withSamples(this.form.body || '');
    const escaped = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const mediaUrl = this.form.mediaUrl;
    const mediaType = this.form.mediaType;
    const mediaHtml = mediaUrl
      ? mediaType === 'video'
        ? `<div style="text-align:center;margin-bottom:24px;"><video src="${mediaUrl}" controls style="max-width:100%;border-radius:16px;"></video></div>`
        : `<div style="text-align:center;margin-bottom:24px;"><img src="${mediaUrl}" alt="" style="max-width:100%;border-radius:16px;" /></div>`
      : '';
    const bodyHtml = escaped
      ? `<div style="font-size:16px;color:#374151;line-height:1.7;white-space:pre-wrap;">${escaped}</div>`
      : `<div style="font-size:15px;color:#9CA3AF;font-style:italic;">El mensaje aparecerá aquí...</div>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{margin:0;padding:0;background:#f9fafb;}</style>
      </head><body>
      <div style="font-family:'Inter',Arial,sans-serif;background:#f9fafb;padding:32px 16px;">
        <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,.1);">
          <div style="padding:40px;">${mediaHtml}${bodyHtml}</div>
          <div style="background:#111827;padding:20px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">© 2026 Maya CRM</p>
          </div>
        </div>
      </div>
    </body></html>`;
  }

  save() {
    if (!this.form.name.trim()) { this.formError.set('El nombre es obligatorio'); return; }
    const isCloud = this.form.channel === 'cloudapi';
    const isEmail = this.form.channel === 'email';
    const isSms = this.form.channel === 'sms';
    const hasTemplate = isCloud && !!this.form.templateName;
    const hasEmailTemplate = isEmail && !!this.form.emailTemplateId;
    if (!hasTemplate && !hasEmailTemplate && !this.form.body.trim()) { this.formError.set('El mensaje es obligatorio'); return; }
    if (this.form.targeting === 'contacts' && !this.selectedContactIds().length) {
      this.formError.set('Elige al menos un contacto');
      return;
    }
    const usesLink = /\{link\}/i.test(this.form.body + ' ' + this.form.subject);
    if ((isEmail || isSms) && usesLink && !this.form.linkUrl.trim()) {
      this.formError.set('El mensaje usa el link corto: indica a qué dirección debe llevar');
      return;
    }
    this.formError.set('');
    this.saving.set(true);

    const isWa = !isEmail && !isSms;
    const body = hasTemplate ? `[Plantilla: ${this.form.templateName}]` : hasEmailTemplate ? '' : this.form.body;
    const queued = isEmail || isSms;

    const payload: CampaignPayload = {
      name: this.form.name.trim(),
      type: isEmail ? 'email' : isSms ? 'sms' : 'whatsapp',
      waProvider: isWa ? (this.form.channel as 'waha' | 'cloudapi') : undefined,
      subject: isEmail ? this.form.subject.trim() : undefined,
      body,
      targeting: this.form.targeting,
      recipientTags: this.form.targeting === 'tags' ? this.form.recipientTags : [],
      listIds: this.form.targeting === 'lists' ? this.form.listIds : [],
      customerIds: this.form.targeting === 'contacts' ? this.selectedContactIds() : [],
      // Siempre se mandan (aunque vacíos) para poder quitar un valor guardado.
      emailTemplateId: isEmail ? this.form.emailTemplateId : '',
      senderAccountId: isEmail ? this.form.senderAccountId : '',
      linkUrl: queued ? this.form.linkUrl.trim() : '',
      linkDomain: queued ? this.form.linkDomain : '',
      scheduledAt: queued && this.form.scheduledAt ? new Date(this.form.scheduledAt).toISOString() : '',
    };
    if (this.form.mediaUrl) {
      payload.mediaUrl = this.form.mediaUrl;
      payload.mediaType = this.form.mediaType;
    }
    if (hasTemplate) {
      payload.templateName = this.form.templateName;
      payload.templateLanguage = this.form.templateLanguage;
      payload.templateVars = this.form.templateVars;
    }

    const req$ = this.editingId()
      ? this.api.updateCampaign(this.editingId()!, payload)
      : this.api.createCampaign(payload);

    req$.subscribe({
      next: () => {
        this.toast.success(this.editingId() ? 'Campaña actualizada' : 'Campaña creada');
        this.saving.set(false);
        this.saved.emit();
      },
      error: (err: { error?: { message?: string } }) => {
        const msg = err.error?.message || 'Error al guardar';
        this.formError.set(msg);
        this.toast.error(msg);
        this.saving.set(false);
      },
    });
  }
}
