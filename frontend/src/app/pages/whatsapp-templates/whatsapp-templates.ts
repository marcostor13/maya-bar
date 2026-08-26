import { Component, computed, inject, signal, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Plus, RefreshCw, Trash2, Pencil, X, Save, Layout,
  Search, AlertTriangle, MessageSquare, Upload, ExternalLink, Phone, Copy, Reply, Image,
} from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AccountsApiService } from '../../core/api/accounts-api.service';
import {
  WaTemplate, WaTemplateAccount, WaTemplateCategory, WaTemplateStatus,
  WaHeaderFormat, WaButtonType, WaTemplateButton, WaTemplatePayload, WaTemplateUpdatePayload,
  WaTemplateAuth, WaOtpType,
} from '../../shared/models/accounts.model';

const API = environment.apiUrl;

/** Tipos que Meta acepta en la cabecera multimedia de una plantilla. */
const MEDIA_TYPES: Record<string, string[]> = {
  IMAGE: ['image/jpeg', 'image/png'],
  VIDEO: ['video/mp4', 'video/3gpp'],
  DOCUMENT: ['application/pdf'],
};

/** Formulario de plantilla; refleja 1:1 lo que acepta Meta. */
interface TemplateForm {
  _id: string;
  name: string;
  category: WaTemplateCategory;
  language: string;
  allowCategoryChange: boolean;
  headerFormat: '' | WaHeaderFormat;
  headerText: string;
  headerExample: string;
  headerMediaUrl: string;
  headerHandle: string;
  body: string;
  bodyExamples: string[];
  footer: string;
  buttons: WaTemplateButton[];
  auth: WaTemplateAuth;
}

function blankForm(): TemplateForm {
  return {
    _id: '', name: '', category: 'MARKETING', language: 'es', allowCategoryChange: true,
    headerFormat: '', headerText: '', headerExample: '', headerMediaUrl: '', headerHandle: '',
    body: '', bodyExamples: [], footer: '', buttons: [],
    auth: { otpType: 'COPY_CODE', addSecurityRecommendation: true, codeExpirationMinutes: 10, buttonText: '' },
  };
}

@Component({
  selector: 'app-whatsapp-templates',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">Plantillas de WhatsApp</h1>
          <p class="page-sub">Mensajes aprobados por Meta para iniciar conversaciones y campañas. Cada cuenta de WhatsApp tiene las suyas.</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" (click)="sync()" [disabled]="!currentAccount()?.ready || syncing()">
            <lucide-icon [img]="RefreshCw" [size]="16" [class.spin]="syncing()"></lucide-icon>
            Sincronizar con Meta
          </button>
          <button class="btn btn-primary" (click)="newTemplate()" [disabled]="!currentAccount()?.ready">
            <lucide-icon [img]="Plus" [size]="16"></lucide-icon>
            Nueva plantilla
          </button>
        </div>
      </div>

      @if (accountsLoading()) {
        <div class="state-box"><lucide-icon [img]="RefreshCw" [size]="20" class="spin"></lucide-icon> Cargando cuentas…</div>
      } @else if (accounts().length === 0) {
        <div class="state-box empty">
          <lucide-icon [img]="Layout" [size]="30" [strokeWidth]="1.5"></lucide-icon>
          <p>No hay cuentas de WhatsApp Cloud API.</p>
          <span>Las plantillas solo existen en Cloud API. Conecta una cuenta en Configuración → WhatsApp.</span>
        </div>
      } @else {
        <!-- Selector de cuenta -->
        <div class="account-bar">
          <div class="account-tabs">
            @for (a of accounts(); track a._id) {
              <button class="account-tab" [class.active]="accountId() === a._id" (click)="setAccount(a._id)">
                <span class="account-tab-label">{{ a.label }}</span>
                <span class="account-tab-sub">{{ a.phoneNumber || 'Cloud API' }}</span>
              </button>
            }
          </div>
          <div class="search-wrap">
            <lucide-icon class="search-icon" [img]="Search" [size]="16"></lucide-icon>
            <input class="input search-input" type="search" placeholder="Buscar plantilla"
              [ngModel]="search()" (ngModelChange)="search.set($event)" aria-label="Buscar plantilla" />
          </div>
        </div>

        @if (currentAccount() && !currentAccount()!.ready) {
          <div class="warn-box">
            <lucide-icon [img]="AlertTriangle" [size]="16"></lucide-icon>
            <span>La cuenta <strong>{{ currentAccount()!.label }}</strong> no tiene Access Token o WABA ID. Complétalos en Configuración → WhatsApp para gestionar sus plantillas.</span>
          </div>
        }

        @if (loading()) {
          <div class="state-box"><lucide-icon [img]="RefreshCw" [size]="20" class="spin"></lucide-icon> Cargando plantillas…</div>
        } @else if (visible().length === 0) {
          <div class="state-box empty">
            <lucide-icon [img]="MessageSquare" [size]="30" [strokeWidth]="1.5"></lucide-icon>
            <p>{{ search() ? 'Ninguna plantilla coincide con la búsqueda.' : 'Esta cuenta aún no tiene plantillas.' }}</p>
            @if (!search()) { <span>Sincroniza con Meta para traer las existentes, o crea una nueva.</span> }
          </div>
        } @else {
          <div class="tpl-grid">
            @for (t of visible(); track t._id) {
              <article class="tpl-card">
                <div class="tpl-card-head">
                  <div class="tpl-id">
                    <span class="tpl-name">{{ t.name }}</span>
                    <span class="tpl-meta">{{ t.language }} · {{ categoryLabel(t.category) }}</span>
                  </div>
                  <span class="badge status-{{ t.status.toLowerCase() }}">{{ statusLabel(t.status) }}</span>
                </div>

                <div class="tpl-preview">
                  @if (t.headerText) { <div class="pv-header">{{ t.headerText }}</div> }
                  @else if (t.headerType === 'IMAGE' && t.headerMediaUrl) {
                    <img class="pv-image" [src]="t.headerMediaUrl" alt="Cabecera de la plantilla" />
                  }
                  @else if (t.headerType && t.headerType !== 'TEXT') {
                    <div class="pv-media">
                      <lucide-icon [img]="Image" [size]="16"></lucide-icon>
                      {{ headerLabel(t.headerType) }}
                    </div>
                  }
                  <div class="pv-body">{{ t.body }}</div>
                  @if (t.footer) { <div class="pv-footer">{{ t.footer }}</div> }
                  @if (buttonsOf(t).length) {
                    <div class="pv-buttons">
                      @for (b of buttonsOf(t); track $index) {
                        <span class="pv-button">
                          <lucide-icon [img]="buttonIcon(b.type)" [size]="12"></lucide-icon>
                          {{ b.text || b.example || 'Copiar código' }}
                        </span>
                      }
                    </div>
                  }
                </div>

                @if (t.status === 'REJECTED' && t.rejectedReason) {
                  <div class="tpl-reject">
                    <lucide-icon [img]="AlertTriangle" [size]="13"></lucide-icon>
                    Rechazada por Meta: {{ t.rejectedReason }}
                  </div>
                }

                <div class="tpl-card-actions">
                  @if (t.qualityScore) { <span class="quality">Calidad: {{ t.qualityScore }}</span> }
                  <button class="btn btn-sm btn-ghost btn-icon" (click)="editTemplate(t)" title="Editar">
                    <lucide-icon [img]="Pencil" [size]="14"></lucide-icon>
                  </button>
                  <button class="btn btn-sm btn-ghost btn-icon" (click)="remove(t)" title="Eliminar">
                    <lucide-icon [img]="Trash2" [size]="14" style="color: var(--color-error);"></lucide-icon>
                  </button>
                </div>
              </article>
            }
          </div>
        }
      }
    </div>

    <!-- ══ Drawer de creación / edición ══ -->
    @if (form()) {
      <div class="overlay" (click)="closeForm()">
        <aside class="drawer" (click)="$event.stopPropagation()" role="dialog" aria-label="Plantilla">
          <header class="drawer-head">
            <h2>{{ form()!._id ? 'Editar plantilla' : 'Nueva plantilla' }}</h2>
            <button class="btn btn-sm btn-ghost btn-icon" (click)="closeForm()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="18"></lucide-icon>
            </button>
          </header>

          <div class="drawer-body">
            @if (formError()) { <div class="error-box">{{ formError() }}</div> }

            @if (form()!._id) {
              <div class="hint-box">
                Meta no permite cambiar el nombre ni el idioma de una plantilla existente.
                Al guardar, la plantilla vuelve a revisión.
              </div>
            }

            <!-- Identidad -->
            <div class="field">
              <label class="label">Nombre *</label>
              <input class="input" [(ngModel)]="form()!.name" [disabled]="!!form()!._id"
                (ngModelChange)="normalizeName($event)" placeholder="promo_verano_2026" />
              <span class="field-hint">Solo minúsculas, números y guiones bajos.</span>
            </div>

            <div class="field-row">
              <div class="field">
                <label class="label">Categoría *</label>
                <select class="select" [(ngModel)]="form()!.category" [disabled]="categoryLocked()">
                  <option value="MARKETING">Marketing — promociones y ofertas</option>
                  <option value="UTILITY">Utilidad — confirmaciones y avisos</option>
                  <option value="AUTHENTICATION">Autenticación — códigos de verificación</option>
                </select>
                @if (categoryLocked()) {
                  <span class="field-hint">La categoría de una plantilla aprobada no se puede cambiar.</span>
                }
              </div>
              <div class="field">
                <label class="label">Idioma *</label>
                <select class="select" [(ngModel)]="form()!.language" [disabled]="!!form()!._id">
                  @for (l of languages; track l.code) {
                    <option [value]="l.code">{{ l.label }}</option>
                  }
                </select>
              </div>
            </div>

            @if (!form()!._id) {
              <label class="check-row">
                <input type="checkbox" [(ngModel)]="form()!.allowCategoryChange" />
                <span>Permitir que Meta reclasifique la categoría en vez de rechazar la plantilla</span>
              </label>
            }

            @if (isAuth()) {
              <!-- Autenticación: Meta redacta el texto; solo se configuran estas opciones -->
              <div class="section-sep">Código de verificación</div>
              <div class="hint-box">
                En las plantillas de autenticación Meta redacta el mensaje. Tú solo eliges
                cómo se entrega el código.
              </div>

              <label class="check-row">
                <input type="checkbox" [(ngModel)]="form()!.auth.addSecurityRecommendation" />
                <span>Añadir el aviso "No compartas este código con nadie"</span>
              </label>

              <div class="field-row">
                <div class="field">
                  <label class="label">Caduca a los (minutos)</label>
                  <input class="input" type="number" min="1" max="90"
                    [(ngModel)]="form()!.auth.codeExpirationMinutes" placeholder="10" />
                  <span class="field-hint">Entre 1 y 90. Vacío = sin aviso de caducidad.</span>
                </div>
                <div class="field">
                  <label class="label">Entrega del código *</label>
                  <select class="select" [(ngModel)]="form()!.auth.otpType">
                    <option value="COPY_CODE">Copiar código</option>
                    <option value="ONE_TAP">Autorrelleno con un toque</option>
                    <option value="ZERO_TAP">Autorrelleno sin toques</option>
                  </select>
                </div>
              </div>

              <div class="field">
                <label class="label">Texto del botón <span class="opt">(opcional)</span></label>
                <input class="input" [(ngModel)]="form()!.auth.buttonText" maxlength="25" placeholder="Copiar código" />
              </div>

              @if (form()!.auth.otpType !== 'COPY_CODE') {
                <div class="field">
                  <label class="label">Texto de autorrelleno <span class="opt">(opcional)</span></label>
                  <input class="input" [(ngModel)]="form()!.auth.autofillText" maxlength="25" placeholder="Autorrellenar" />
                </div>
                <div class="field-row">
                  <div class="field">
                    <label class="label">Paquete Android *</label>
                    <input class="input" [(ngModel)]="form()!.auth.packageName" placeholder="com.miempresa.app" />
                  </div>
                  <div class="field">
                    <label class="label">Hash de firma *</label>
                    <input class="input" [(ngModel)]="form()!.auth.signatureHash" placeholder="K8a/AINcGX7" />
                  </div>
                </div>
              }
            } @else {

            <!-- Cabecera -->
            <div class="section-sep">Cabecera <span>(opcional)</span></div>
            <div class="field">
              <label class="label">Tipo</label>
              <select class="select" [(ngModel)]="form()!.headerFormat">
                <option value="">Sin cabecera</option>
                <option value="TEXT">Texto</option>
                <option value="IMAGE">Imagen</option>
                <option value="VIDEO">Video</option>
                <option value="DOCUMENT">Documento</option>
                <option value="LOCATION">Ubicación</option>
              </select>
            </div>

            @if (form()!.headerFormat === 'TEXT') {
              <div class="field">
                <label class="label">Texto de la cabecera</label>
                <input class="input" [(ngModel)]="form()!.headerText" maxlength="60"
                  placeholder="Oferta para &#123;&#123;1&#125;&#125;" />
                <span class="field-hint">Máximo 60 caracteres y una sola variable.</span>
              </div>
              @if (headerHasVariable()) {
                <div class="field">
                  <label class="label">Ejemplo de la variable *</label>
                  <input class="input" [(ngModel)]="form()!.headerExample" placeholder="Marcos" />
                </div>
              }
            } @else if (isMediaHeader()) {
              <div class="field">
                <label class="label">Archivo de ejemplo *</label>
                <input type="file" #headerFile hidden (change)="uploadHeader($event)"
                  [accept]="acceptFor(form()!.headerFormat)" />

                @if (form()!.headerMediaUrl || form()!.headerHandle) {
                  <div class="media-box">
                    @if (form()!.headerFormat === 'IMAGE' && form()!.headerMediaUrl) {
                      <img class="media-thumb" [src]="form()!.headerMediaUrl" alt="Vista previa de la cabecera" />
                    } @else {
                      <span class="media-thumb placeholder">
                        <lucide-icon [img]="Image" [size]="20"></lucide-icon>
                      </span>
                    }
                    <div class="media-info">
                      <span class="upload-ok">
                        {{ form()!.headerMediaUrl ? 'Archivo listo' : 'Archivo ya aprobado en Meta' }}
                      </span>
                      <div class="media-actions">
                        <button class="btn btn-sm btn-ghost" (click)="headerFile.click()" [disabled]="uploading()">
                          {{ uploading() ? 'Subiendo…' : 'Cambiar' }}
                        </button>
                        <button class="btn btn-sm btn-ghost" (click)="clearHeaderMedia()">Quitar</button>
                      </div>
                    </div>
                  </div>
                } @else {
                  <button class="drop-zone" (click)="headerFile.click()" [disabled]="uploading()">
                    <lucide-icon [img]="uploading() ? RefreshCw : Upload" [size]="22" [class.spin]="uploading()"></lucide-icon>
                    <span>{{ uploading() ? 'Subiendo…' : 'Subir ' + mediaWord() }}</span>
                    <small>{{ acceptHint() }}</small>
                  </button>
                }
                <span class="field-hint">Meta exige un ejemplo del archivo para aprobar la plantilla.</span>
              </div>
            }

            <!-- Cuerpo -->
            <div class="section-sep">Cuerpo</div>
            <div class="field">
              <label class="label">Mensaje *</label>
              <textarea class="textarea" rows="5" maxlength="1024"
                [ngModel]="form()!.body" (ngModelChange)="onBodyChange($event)"
                placeholder="Hola &#123;&#123;1&#125;&#125;, tenemos &#123;&#123;2&#125;&#125; de descuento esta semana."></textarea>
              <span class="field-hint">Usa &#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125;… para las variables. {{ form()!.body.length }}/1024</span>
            </div>

            @if (form()!.bodyExamples.length) {
              <div class="field">
                <label class="label">Ejemplos de las variables *</label>
                @for (ex of form()!.bodyExamples; track $index) {
                  <div class="example-row">
                    <span class="example-tag">{{ variableTag($index) }}</span>
                    <input class="input" [ngModel]="ex" (ngModelChange)="setBodyExample($index, $event)"
                      [placeholder]="'Ejemplo para la variable ' + ($index + 1)" />
                  </div>
                }
                <span class="field-hint">Meta rechaza la plantilla si faltan los ejemplos.</span>
              </div>
            }

            <div class="field">
              <label class="label">Pie <span class="opt">(opcional)</span></label>
              <input class="input" [(ngModel)]="form()!.footer" maxlength="60"
                placeholder="Responde BAJA para dejar de recibir mensajes" />
            </div>

            <!-- Botones -->
            <div class="section-sep">Botones <span>(opcional, hasta 10)</span></div>
            @for (b of form()!.buttons; track $index) {
              <div class="button-card">
                <div class="button-card-head">
                  <select class="select select-sm" [ngModel]="b.type" (ngModelChange)="setButtonType($index, $event)">
                    <option value="QUICK_REPLY">Respuesta rápida</option>
                    <option value="URL">Ir a una URL</option>
                    <option value="PHONE_NUMBER">Llamar por teléfono</option>
                    <option value="COPY_CODE">Copiar código</option>
                  </select>
                  <button class="btn btn-sm btn-ghost btn-icon" (click)="removeButton($index)" aria-label="Quitar botón">
                    <lucide-icon [img]="Trash2" [size]="14" style="color: var(--color-error);"></lucide-icon>
                  </button>
                </div>

                @if (b.type !== 'COPY_CODE') {
                  <input class="input" [(ngModel)]="b.text" maxlength="25" placeholder="Texto del botón" />
                }
                @if (b.type === 'URL') {
                  <input class="input" [(ngModel)]="b.url" placeholder="https://tusitio.com/promo/&#123;&#123;1&#125;&#125;" />
                  @if (hasVariable(b.url)) {
                    <input class="input" [(ngModel)]="b.urlExample" placeholder="Ejemplo del valor de la variable" />
                  }
                }
                @if (b.type === 'PHONE_NUMBER') {
                  <input class="input" [(ngModel)]="b.phoneNumber" placeholder="+51999999999" />
                }
                @if (b.type === 'COPY_CODE') {
                  <input class="input" [(ngModel)]="b.example" placeholder="Código de ejemplo: PROMO25" />
                }
              </div>
            }
            @if (form()!.buttons.length < 10) {
              <button class="btn btn-ghost btn-sm" (click)="addButton()">
                <lucide-icon [img]="Plus" [size]="14"></lucide-icon> Añadir botón
              </button>
            }

            }

            <!-- Vista previa -->
            <div class="section-sep">Vista previa</div>
            <div class="preview-phone">
              <div class="preview-bubble">
                @if (form()!.headerFormat === 'TEXT' && form()!.headerText) {
                  <div class="pv-header">{{ form()!.headerText }}</div>
                } @else if (form()!.headerFormat === 'IMAGE' && form()!.headerMediaUrl) {
                  <img class="pv-image" [src]="form()!.headerMediaUrl" alt="Cabecera de la plantilla" />
                } @else if (isMediaHeader()) {
                  <div class="pv-media">
                    <lucide-icon [img]="Image" [size]="16"></lucide-icon>
                    {{ headerLabel(form()!.headerFormat) }}
                  </div>
                }
                <div class="pv-body">{{ isAuth() ? authPreview() : (form()!.body || 'Escribe el mensaje…') }}</div>
                @if (isAuth()) {
                  @if (form()!.auth.codeExpirationMinutes) {
                    <div class="pv-footer">El código caduca en {{ form()!.auth.codeExpirationMinutes }} minutos</div>
                  }
                  <div class="pv-buttons">
                    <span class="pv-button">
                      <lucide-icon [img]="Copy" [size]="12"></lucide-icon>
                      {{ form()!.auth.buttonText || 'Copiar código' }}
                    </span>
                  </div>
                } @else {
                  @if (form()!.footer) { <div class="pv-footer">{{ form()!.footer }}</div> }
                  @if (form()!.buttons.length) {
                    <div class="pv-buttons">
                      @for (b of form()!.buttons; track $index) {
                        <span class="pv-button">
                          <lucide-icon [img]="buttonIcon(b.type)" [size]="12"></lucide-icon>
                          {{ b.text || b.example || 'Copiar código' }}
                        </span>
                      }
                    </div>
                  }
                }
              </div>
            </div>
          </div>

          <footer class="drawer-foot">
            <button class="btn btn-ghost" (click)="closeForm()">Cancelar</button>
            <button class="btn btn-primary" (click)="save()" [disabled]="saving()">
              <lucide-icon [img]="Save" [size]="16"></lucide-icon>
              {{ saving() ? 'Enviando a Meta…' : (form()!._id ? 'Guardar cambios' : 'Crear plantilla') }}
            </button>
          </footer>
        </aside>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 28px; flex-wrap: wrap; }
    .page-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; color: var(--color-text-main); margin: 0 0 4px; }
    .page-sub { font-size: 14px; color: var(--color-text-muted); margin: 0; max-width: 620px; }
    .header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

    /* Barra de cuentas */
    .account-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .account-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
    .account-tab {
      display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
      border: 1px solid var(--color-border); background: var(--color-white);
      border-radius: var(--radius-pill); padding: 8px 18px; cursor: pointer;
      transition: all var(--transition-fast);
    }
    .account-tab:hover { border-color: var(--color-brand); }
    .account-tab.active { border-color: var(--color-brand); background: var(--color-brand); }
    .account-tab.active .account-tab-label, .account-tab.active .account-tab-sub { color: var(--color-white); }
    .account-tab-label { font-size: 13px; font-weight: 700; color: var(--color-text-main); }
    .account-tab-sub { font-size: 11px; color: var(--color-text-muted); }

    .search-wrap { position: relative; min-width: 240px; }
    .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); pointer-events: none; }
    .search-input { padding-left: 40px; width: 100%; }

    .warn-box {
      display: flex; align-items: center; gap: 10px; margin-bottom: 20px;
      background: #FEFCE8; border: 1px solid #FEF08A; color: #854D0E;
      border-radius: var(--radius-lg); padding: 14px 18px; font-size: 13px;
    }

    .state-box { display: flex; align-items: center; gap: 10px; color: var(--color-text-muted); font-size: 14px; padding: 20px 0; }
    .state-box.empty { flex-direction: column; align-items: center; gap: 8px; padding: 48px 24px; text-align: center; }
    .state-box.empty p { margin: 0; font-weight: 600; color: var(--color-text-main); }
    .state-box.empty span { font-size: 13px; }

    /* Tarjetas */
    .tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
    .tpl-card {
      background: var(--color-white); border: 1px solid var(--color-border);
      border-radius: var(--radius-lg); padding: 24px; display: flex; flex-direction: column; gap: 14px;
      box-shadow: var(--shadow-sm);
    }
    .tpl-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .tpl-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .tpl-name { font-family: monospace; font-size: 14px; font-weight: 700; color: var(--color-text-main); word-break: break-all; }
    .tpl-meta { font-size: 12px; color: var(--color-text-muted); }

    .badge { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: var(--radius-pill); border: 1px solid var(--color-border); background: var(--color-bg-app); color: var(--color-text-muted); flex-shrink: 0; }
    .status-approved { background: #F0FDF4; color: #15803D; border-color: #BBF7D0; }
    .status-pending, .status-in_appeal { background: #FEFCE8; color: #854D0E; border-color: #FEF08A; }
    .status-rejected, .status-disabled { background: #FEF2F2; color: #DC2626; border-color: #FECACA; }
    .status-paused { background: #F1F5F9; color: #475569; border-color: #CBD5E1; }

    /* Burbuja de vista previa */
    .tpl-preview, .preview-bubble {
      background: #F0F7F4; border-radius: 16px; padding: 14px 16px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .pv-header { font-weight: 700; font-size: 13px; color: var(--color-text-main); }
    .pv-media { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--color-text-muted); background: var(--color-white); border-radius: 10px; padding: 14px; }
    .pv-image { width: 100%; max-height: 180px; object-fit: cover; border-radius: 10px; display: block; }
    .pv-body { font-size: 13px; color: var(--color-text-main); white-space: pre-wrap; word-break: break-word; }
    .pv-footer { font-size: 11px; color: var(--color-text-muted); }
    .pv-buttons { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; border-top: 1px solid rgba(15,23,42,0.08); padding-top: 8px; }
    .pv-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 12px; font-weight: 600; color: #0EA5E9; }

    .tpl-reject { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; color: var(--color-error); }
    .tpl-card-actions { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: auto; }
    .quality { font-size: 11px; color: var(--color-text-muted); margin-right: auto; }

    /* Drawer */
    .overlay {
      position: fixed; inset: 0; background: rgba(15,23,42,0.45);
      backdrop-filter: blur(3px); display: flex; align-items: stretch; justify-content: flex-end; z-index: 100;
    }
    .drawer {
      width: 560px; max-width: 100%; background: var(--color-white);
      display: flex; flex-direction: column; box-shadow: var(--shadow-lg);
      animation: slide-in var(--transition-spring);
    }
    @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }

    .drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 24px 28px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
    .drawer-head h2 { font-family: var(--font-heading); font-size: 18px; font-weight: 700; margin: 0; }
    .drawer-body { flex: 1; overflow-y: auto; padding: 24px 28px; display: flex; flex-direction: column; gap: 18px; }
    .drawer-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 20px 28px; border-top: 1px solid var(--color-border); flex-shrink: 0; }

    .field { display: flex; flex-direction: column; gap: 6px; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .label .opt { font-weight: 500; color: var(--color-text-muted); }
    .field-hint { font-size: 12px; color: var(--color-text-muted); }

    .section-sep { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); border-top: 1px solid var(--color-border); padding-top: 16px; }
    .section-sep span { text-transform: none; font-weight: 500; letter-spacing: 0; }

    .check-row { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--color-text-main); cursor: pointer; }
    .check-row input { margin-top: 2px; }

    .example-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .example-tag { font-family: monospace; font-size: 12px; font-weight: 700; color: var(--color-brand); flex-shrink: 0; }

    .upload-ok { font-size: 12px; font-weight: 600; color: #16A34A; }

    .drop-zone {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
      width: 100%; padding: 28px 20px; cursor: pointer;
      border: 1.5px dashed var(--color-border); border-radius: var(--radius-lg);
      background: var(--color-bg-app); color: var(--color-text-muted);
      font-size: 13px; font-weight: 600; transition: all var(--transition-fast);
    }
    .drop-zone:hover:not(:disabled) { border-color: var(--color-brand); color: var(--color-brand); }
    .drop-zone:disabled { cursor: default; opacity: 0.7; }
    .drop-zone small { font-weight: 500; font-size: 11px; }

    .media-box { display: flex; align-items: center; gap: 14px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 12px 14px; }
    .media-thumb { width: 72px; height: 72px; border-radius: 12px; object-fit: cover; flex-shrink: 0; background: var(--color-bg-app); }
    .media-thumb.placeholder { display: flex; align-items: center; justify-content: center; color: var(--color-text-muted); }
    .media-info { display: flex; flex-direction: column; gap: 4px; }
    .media-actions { display: flex; gap: 4px; }

    .button-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
    .button-card-head { display: flex; align-items: center; gap: 8px; }
    .select-sm { flex: 1; }

    .preview-phone { background: var(--color-bg-app); border-radius: var(--radius-lg); padding: 18px; }

    .error-box { background: #FEF2F2; border: 1px solid #FECACA; color: #DC2626; border-radius: var(--radius-lg); padding: 12px 16px; font-size: 13px; }
    .hint-box { background: var(--color-bg-app); border-radius: var(--radius-lg); padding: 12px 16px; font-size: 12px; color: var(--color-text-muted); }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; display: inline-block; }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .header-actions { width: 100%; }
      .header-actions > .btn { flex: 1; justify-content: center; }
      .tpl-grid { grid-template-columns: 1fr; }
      .field-row { grid-template-columns: 1fr; }
      .drawer { width: 100%; }
      .drawer-head, .drawer-body, .drawer-foot { padding-left: 20px; padding-right: 20px; }
    }
  `],
})
export class WhatsappTemplatesComponent implements OnInit {
  private api = inject(AccountsApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirmSvc = inject(ConfirmService);

  readonly Plus = Plus;
  readonly RefreshCw = RefreshCw;
  readonly Trash2 = Trash2;
  readonly Pencil = Pencil;
  readonly X = X;
  readonly Save = Save;
  readonly Layout = Layout;
  readonly Search = Search;
  readonly AlertTriangle = AlertTriangle;
  readonly MessageSquare = MessageSquare;
  readonly Upload = Upload;
  readonly Image = Image;
  readonly Copy = Copy;

  readonly languages = [
    { code: 'es', label: 'Español (es)' },
    { code: 'es_MX', label: 'Español México (es_MX)' },
    { code: 'es_AR', label: 'Español Argentina (es_AR)' },
    { code: 'es_ES', label: 'Español España (es_ES)' },
    { code: 'en_US', label: 'English US (en_US)' },
    { code: 'en_GB', label: 'English UK (en_GB)' },
    { code: 'pt_BR', label: 'Português Brasil (pt_BR)' },
  ];

  accounts = signal<WaTemplateAccount[]>([]);
  accountsLoading = signal(true);
  accountId = signal('');
  templates = signal<WaTemplate[]>([]);
  loading = signal(false);
  syncing = signal(false);
  search = signal('');

  form = signal<TemplateForm | null>(null);
  formError = signal('');
  saving = signal(false);
  uploading = signal(false);

  currentAccount = computed(() => this.accounts().find(a => a._id === this.accountId()) ?? null);

  visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.templates();
    return this.templates().filter(t =>
      t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q));
  });

  /** Meta no deja recategorizar una plantilla ya aprobada. */
  categoryLocked = computed(() => {
    const f = this.form();
    if (!f?._id) return false;
    return this.templates().find(t => t._id === f._id)?.status === 'APPROVED';
  });

  ngOnInit() {
    this.loadAccounts();
  }

  @HostListener('document:keydown.escape')
  onEsc() { if (this.form()) this.closeForm(); }

  // ── Datos ──

  loadAccounts() {
    this.accountsLoading.set(true);
    this.api.getTemplateAccounts().subscribe({
      next: list => {
        this.accounts.set(list);
        this.accountsLoading.set(false);
        const preferred = list.find(a => a.isDefault && a.ready) ?? list.find(a => a.ready) ?? list[0];
        if (preferred) this.setAccount(preferred._id);
      },
      error: () => { this.accountsLoading.set(false); this.toast.error('No se pudieron cargar las cuentas'); },
    });
  }

  setAccount(id: string) {
    this.accountId.set(id);
    this.load();
  }

  load() {
    const id = this.accountId();
    if (!id) return;
    this.loading.set(true);
    this.api.getTemplates(id).subscribe({
      next: list => { this.templates.set(list); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.error('No se pudieron cargar las plantillas'); },
    });
  }

  sync() {
    const id = this.accountId();
    if (!id) return;
    this.syncing.set(true);
    this.api.syncTemplates(id).subscribe({
      next: list => {
        this.templates.set(list);
        this.syncing.set(false);
        this.toast.success(`${list.length} plantilla(s) sincronizadas desde Meta`);
      },
      error: (err: { error?: { message?: string } }) => {
        this.syncing.set(false);
        this.toast.error(err.error?.message || 'Error al sincronizar con Meta');
      },
    });
  }

  // ── Formulario ──

  newTemplate() {
    this.formError.set('');
    this.form.set(blankForm());
  }

  editTemplate(t: WaTemplate) {
    this.formError.set('');
    const header = (t.components ?? []).find(c => c.type === 'HEADER');
    const bodyComp = (t.components ?? []).find(c => c.type === 'BODY');
    const bodyExamples = ((bodyComp?.example?.['body_text'] as string[][]) ?? [[]])[0] ?? [];

    this.form.set({
      _id: t._id,
      name: t.name,
      category: t.category,
      language: t.language,
      allowCategoryChange: false,
      headerFormat: (header?.format as WaHeaderFormat) ?? '',
      headerText: header?.text ?? '',
      headerExample: ((header?.example?.['header_text'] as string[]) ?? [])[0] ?? '',
      headerMediaUrl: t.headerMediaUrl ?? '',
      headerHandle: ((header?.example?.['header_handle'] as string[]) ?? [])[0] ?? '',
      body: t.body,
      bodyExamples: [...bodyExamples],
      footer: t.footer ?? '',
      buttons: this.buttonsOf(t),
      auth: this.authOf(t),
    });
    this.syncBodyExamples(t.body);
  }

  closeForm() { this.form.set(null); this.formError.set(''); }

  normalizeName(value: string) {
    const f = this.form();
    if (!f) return;
    f.name = value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  onBodyChange(value: string) {
    const f = this.form();
    if (!f) return;
    f.body = value;
    this.syncBodyExamples(value);
  }

  /** Mantiene tantos campos de ejemplo como variables {{n}} tenga el cuerpo. */
  private syncBodyExamples(body: string) {
    const f = this.form();
    if (!f) return;
    const count = this.placeholderCount(body);
    const next = [...f.bodyExamples];
    next.length = count;
    f.bodyExamples = next.map(v => v ?? '');
  }

  setBodyExample(index: number, value: string) {
    const f = this.form();
    if (!f) return;
    const next = [...f.bodyExamples];
    next[index] = value;
    f.bodyExamples = next;
  }

  addButton() {
    const f = this.form();
    if (!f) return;
    f.buttons = [...f.buttons, { type: 'QUICK_REPLY', text: '' }];
  }

  setButtonType(index: number, type: WaButtonType) {
    const f = this.form();
    if (!f) return;
    const next = [...f.buttons];
    next[index] = { type, text: next[index].text ?? '' };
    f.buttons = next;
  }

  removeButton(index: number) {
    const f = this.form();
    if (!f) return;
    f.buttons = f.buttons.filter((_, i) => i !== index);
  }

  uploadHeader(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const f = this.form();
    if (!f) return;

    const allowed = MEDIA_TYPES[f.headerFormat] ?? [];
    if (!allowed.includes(file.type)) {
      this.toast.error(`Meta solo admite ${this.acceptHint()} en esta cabecera`);
      return;
    }
    // Meta rechaza imágenes de más de 5 MB en las plantillas.
    if (f.headerFormat === 'IMAGE' && file.size > 5 * 1024 * 1024) {
      this.toast.error('La imagen no puede pasar de 5 MB');
      return;
    }

    this.uploading.set(true);
    const fd = new FormData();
    fd.append('file', file, file.name);
    this.http.post<{ url: string }>(`${API}/upload?folder=wa-templates`, fd).subscribe({
      next: r => {
        f.headerMediaUrl = r.url;
        f.headerHandle = '';
        this.uploading.set(false);
        this.toast.success('Archivo subido');
      },
      error: (err: { error?: { message?: string } }) => {
        this.uploading.set(false);
        this.toast.error(err.error?.message || 'No se pudo subir el archivo');
      },
    });
  }

  clearHeaderMedia() {
    const f = this.form();
    if (!f) return;
    f.headerMediaUrl = '';
    f.headerHandle = '';
  }

  save() {
    const f = this.form();
    if (!f) return;
    const error = this.validate(f);
    if (error) { this.formError.set(error); return; }

    this.saving.set(true);
    this.formError.set('');
    const done = (message: string) => {
      this.saving.set(false);
      this.closeForm();
      this.load();
      this.toast.success(message);
    };
    const fail = (err: { error?: { message?: string } }) => {
      this.saving.set(false);
      const message = err.error?.message || 'Error al guardar la plantilla';
      this.formError.set(message);
      this.toast.error(message);
    };

    if (f._id) {
      const dto: WaTemplateUpdatePayload = {
        category: this.categoryLocked() ? undefined : f.category,
        ...this.componentPayload(f),
      };
      this.api.updateTemplate(f._id, dto).subscribe({
        next: () => done('Plantilla actualizada. Vuelve a revisión de Meta.'),
        error: fail,
      });
    } else {
      const dto: WaTemplatePayload = {
        accountId: this.accountId(),
        name: f.name.trim(),
        category: f.category,
        language: f.language,
        allowCategoryChange: f.allowCategoryChange,
        ...this.componentPayload(f),
      };
      this.api.createTemplate(dto).subscribe({
        next: () => done('Plantilla enviada a Meta. Queda pendiente de aprobación.'),
        error: fail,
      });
    }
  }

  /** Parte común del payload: cabecera, cuerpo, pie y botones. */
  private componentPayload(f: TemplateForm) {
    if (f.category === 'AUTHENTICATION') {
      return {
        authentication: {
          ...f.auth,
          codeExpirationMinutes: f.auth.codeExpirationMinutes
            ? Number(f.auth.codeExpirationMinutes)
            : undefined,
          buttonText: f.auth.buttonText?.trim() || undefined,
        },
      };
    }
    return {
      body: f.body.trim(),
      bodyExamples: f.bodyExamples.map(v => v.trim()),
      footer: f.footer.trim() || undefined,
      header: f.headerFormat
        ? {
            format: f.headerFormat,
            text: f.headerFormat === 'TEXT' ? f.headerText.trim() : undefined,
            example: f.headerFormat === 'TEXT' ? f.headerExample.trim() || undefined : undefined,
            mediaUrl: f.headerMediaUrl || undefined,
            handle: f.headerHandle || undefined,
          }
        : undefined,
      buttons: f.buttons.length ? f.buttons : undefined,
    };
  }

  private validate(f: TemplateForm): string {
    if (!f._id && !f.name.trim()) return 'El nombre es obligatorio';

    if (f.category === 'AUTHENTICATION') {
      const minutes = Number(f.auth.codeExpirationMinutes);
      if (f.auth.codeExpirationMinutes && (minutes < 1 || minutes > 90))
        return 'La caducidad del código debe estar entre 1 y 90 minutos';
      if (f.auth.otpType !== 'COPY_CODE' &&
        (!f.auth.packageName?.trim() || !f.auth.signatureHash?.trim()))
        return 'El autorrelleno necesita el paquete Android y su hash de firma';
      return '';
    }

    if (!f.body.trim()) return 'El cuerpo del mensaje es obligatorio';
    if (f.bodyExamples.some(v => !v.trim()))
      return 'Indica un ejemplo para cada variable del cuerpo';
    if (f.headerFormat === 'TEXT') {
      if (!f.headerText.trim()) return 'La cabecera de texto está vacía';
      if (this.placeholderCount(f.headerText) > 1)
        return 'La cabecera admite como máximo una variable';
      if (this.headerHasVariable() && !f.headerExample.trim())
        return 'Indica un ejemplo para la variable de la cabecera';
    }
    if (this.isMediaHeader() && !f.headerMediaUrl && !f.headerHandle)
      return 'Sube un archivo de ejemplo para la cabecera';
    for (const b of f.buttons) {
      if (b.type === 'COPY_CODE') {
        if (!b.example?.trim()) return 'El botón de copiar código necesita un código de ejemplo';
        continue;
      }
      if (!b.text?.trim()) return 'Todos los botones necesitan texto';
      if (b.type === 'URL') {
        if (!b.url?.trim()) return 'El botón de URL necesita una dirección';
        if (this.hasVariable(b.url) && !b.urlExample?.trim())
          return 'Indica un ejemplo para la variable de la URL';
      }
      if (b.type === 'PHONE_NUMBER' && !b.phoneNumber?.trim())
        return 'El botón de llamada necesita un teléfono';
    }
    return '';
  }

  async remove(t: WaTemplate) {
    const ok = await this.confirmSvc.confirm({
      title: 'Eliminar plantilla',
      message: `¿Eliminar "${t.name}"? También se elimina en Meta y dejará de poder usarse en campañas.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.deleteTemplate(t._id).subscribe({
      next: () => {
        this.templates.update(list => list.filter(x => x._id !== t._id));
        this.toast.success('Plantilla eliminada');
      },
      error: (err: { error?: { message?: string } }) =>
        this.toast.error(err.error?.message || 'Error al eliminar la plantilla'),
    });
  }

  // ── Utilidades de presentación ──

  /** Extrae los botones de los componentes crudos de Meta. */
  buttonsOf(t: WaTemplate): WaTemplateButton[] {
    const comp = (t.components ?? []).find(c => c.type === 'BUTTONS');
    return ((comp?.buttons ?? []) as Record<string, unknown>[]).map(b => ({
      type: b['type'] as WaButtonType,
      text: b['text'] as string | undefined,
      url: b['url'] as string | undefined,
      urlExample: ((b['example'] as string[]) ?? [])[0],
      phoneNumber: b['phone_number'] as string | undefined,
      example: typeof b['example'] === 'string' ? (b['example'] as string) : undefined,
    }));
  }

  /** Etiqueta visible de la variable n-ésima, p.ej. {{1}}. */
  variableTag(index: number): string {
    return `{{${index + 1}}}`;
  }

  isAuth(): boolean { return this.form()?.category === 'AUTHENTICATION'; }

  /** Texto aproximado que Meta genera para una plantilla de autenticación. */
  authPreview(): string {
    const base = '123456 es tu código de verificación.';
    return this.form()?.auth.addSecurityRecommendation
      ? `${base} Por tu seguridad, no lo compartas.`
      : base;
  }

  /** Reconstruye las opciones de autenticación desde los componentes de Meta. */
  authOf(t: WaTemplate): WaTemplateAuth {
    const comps = t.components ?? [];
    const body = comps.find(c => c.type === 'BODY') as Record<string, unknown> | undefined;
    const footer = comps.find(c => c.type === 'FOOTER') as Record<string, unknown> | undefined;
    const otp = ((comps.find(c => c.type === 'BUTTONS')?.buttons ?? []) as Record<string, unknown>[])
      .find(b => b['type'] === 'OTP');
    return {
      addSecurityRecommendation: !!body?.['add_security_recommendation'],
      codeExpirationMinutes: (footer?.['code_expiration_minutes'] as number) ?? undefined,
      otpType: ((otp?.['otp_type'] as WaOtpType) ?? 'COPY_CODE'),
      buttonText: (otp?.['text'] as string) ?? '',
      autofillText: (otp?.['autofill_text'] as string) ?? '',
      packageName: (otp?.['package_name'] as string) ?? '',
      signatureHash: (otp?.['signature_hash'] as string) ?? '',
    };
  }

  placeholderCount(text = ''): number {
    return new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => m[1])).size;
  }

  hasVariable(text = ''): boolean { return this.placeholderCount(text) > 0; }

  headerHasVariable(): boolean {
    const f = this.form();
    return !!f && f.headerFormat === 'TEXT' && this.hasVariable(f.headerText);
  }

  isMediaHeader(): boolean {
    const format = this.form()?.headerFormat;
    return format === 'IMAGE' || format === 'VIDEO' || format === 'DOCUMENT';
  }

  acceptFor(format: '' | WaHeaderFormat): string {
    return (MEDIA_TYPES[format] ?? []).join(',');
  }

  /** Formatos que Meta admite, en texto para el usuario. */
  acceptHint(): string {
    switch (this.form()?.headerFormat) {
      case 'IMAGE': return 'JPG o PNG, hasta 5 MB';
      case 'VIDEO': return 'MP4 o 3GP';
      case 'DOCUMENT': return 'PDF';
      default: return '';
    }
  }

  mediaWord(): string {
    switch (this.form()?.headerFormat) {
      case 'IMAGE': return 'imagen';
      case 'VIDEO': return 'video';
      default: return 'documento';
    }
  }

  headerLabel(format?: string): string {
    switch (format) {
      case 'IMAGE': return 'Imagen';
      case 'VIDEO': return 'Video';
      case 'DOCUMENT': return 'Documento';
      case 'LOCATION': return 'Ubicación';
      default: return 'Cabecera';
    }
  }

  categoryLabel(category: WaTemplateCategory): string {
    switch (category) {
      case 'MARKETING': return 'Marketing';
      case 'UTILITY': return 'Utilidad';
      case 'AUTHENTICATION': return 'Autenticación';
    }
  }

  statusLabel(status: WaTemplateStatus): string {
    switch (status) {
      case 'APPROVED': return 'Aprobada';
      case 'PENDING': return 'En revisión';
      case 'IN_APPEAL': return 'En apelación';
      case 'REJECTED': return 'Rechazada';
      case 'PAUSED': return 'Pausada';
      case 'DISABLED': return 'Deshabilitada';
    }
  }

  buttonIcon(type: WaButtonType) {
    switch (type) {
      case 'URL': return ExternalLink;
      case 'PHONE_NUMBER': return Phone;
      case 'COPY_CODE': return Copy;
      default: return Reply;
    }
  }
}
