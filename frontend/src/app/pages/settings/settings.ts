import { Component, inject, signal, OnInit, OnDestroy, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, MessageSquare, CheckCircle2, XCircle, RefreshCw,
  Save, Wifi, WifiOff, QrCode, ExternalLink, Eye, EyeOff, Plus, Trash2, X, Layout, Sparkles
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

interface TenantConfig {
  whatsappProvider: string;
  wahaApiUrl?: string;
  wahaApiKey?: string;
  wahaSession?: string;
  waPhoneNumberId?: string;
  waAccessToken?: string;
  waBusinessAccountId?: string;
  waDailyLimit?: number;
  openaiApiKey?: string;
  deepseekApiKey?: string;
  geminiApiKey?: string;
  claudeApiKey?: string;
}

interface WaStatus {
  provider: string;
  configured: boolean;
  connected: boolean;
  instance?: string;
  phoneNumber?: string;
  state?: string;
  error?: string;
}

interface WaTemplate {
  _id: string;
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';
  body: string;
  headerText?: string;
  footer?: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">Configuración</h1>
          <p class="page-subtitle">Integraciones y ajustes de la plataforma</p>
        </div>
      </div>

      <!-- WhatsApp Card -->
      <div class="section-card">
        <div class="section-header">
          <div class="section-icon">
            <lucide-icon [img]="MessageSquare" [size]="22" style="color: #16A34A;"></lucide-icon>
          </div>
          <div>
            <h2 class="section-title">WhatsApp</h2>
            <p class="section-desc">Conecta WhatsApp para enviar campañas y mensajes a tus clientes</p>
          </div>
          <div class="status-pill"
            [class.connected]="waStatus()?.provider === form.whatsappProvider && waStatus()?.connected"
            [class.disconnected]="waStatus()?.provider === form.whatsappProvider && !waStatus()!.connected">
            @if (statusLoading()) {
              <lucide-icon [img]="RefreshCw" [size]="13" class="spin"></lucide-icon>
              Verificando...
            } @else if (waStatus()?.provider === form.whatsappProvider && waStatus()?.connected) {
              <lucide-icon [img]="CheckCircle2" [size]="13"></lucide-icon>
              Conectado
            } @else if (waStatus()?.provider === form.whatsappProvider && waStatus()?.configured) {
              <lucide-icon [img]="WifiOff" [size]="13"></lucide-icon>
              Desconectado
            } @else {
              <lucide-icon [img]="XCircle" [size]="13"></lucide-icon>
              No configurado
            }
          </div>
        </div>

        <!-- Provider selector -->
        <div class="provider-tabs">
          <button class="provider-tab" [class.active]="form.whatsappProvider === 'none'" (click)="setProvider('none')">
            Desactivado
          </button>
          <button class="provider-tab" [class.active]="form.whatsappProvider === 'waha'" (click)="setProvider('waha')">
            WAHA
          </button>
          <button class="provider-tab" [class.active]="form.whatsappProvider === 'cloudapi'" (click)="setProvider('cloudapi')">
            WhatsApp Cloud API
          </button>
        </div>

        <!-- WAHA fields -->
        @if (form.whatsappProvider === 'waha') {
          <div class="fields-grid">
            <div class="field">
              <label class="label">URL de WAHA *</label>
              <input class="input" [(ngModel)]="form.wahaApiUrl" placeholder="http://localhost:3000" />
              <span class="field-hint">URL donde corre tu instancia de WAHA</span>
            </div>
            <div class="field">
              <label class="label">API Key</label>
              <div class="input-wrap">
                <input class="input" [type]="showKey() ? 'text' : 'password'" [(ngModel)]="form.wahaApiKey" placeholder="tu-api-key-secreta" />
                <button class="eye-btn" (click)="showKey.set(!showKey())" type="button">
                  <lucide-icon [img]="showKey() ? EyeOff : Eye" [size]="16"></lucide-icon>
                </button>
              </div>
              <span class="field-hint">El valor de WHATSAPP_API_KEY en tu configuración de WAHA</span>
            </div>
            <div class="field">
              <label class="label">Nombre de sesión</label>
              <input class="input" [(ngModel)]="form.wahaSession" placeholder="default" />
              <span class="field-hint">Nombre de la sesión WAHA (por defecto: "default")</span>
            </div>
            <div class="field">
              <label class="label">Límite diario de mensajes</label>
              <input class="input" type="number" [(ngModel)]="form.waDailyLimit" min="1" max="500" placeholder="50" style="max-width: 140px;" />
              <span class="field-hint">Máximo de mensajes WhatsApp por día. Recomendado: 50 para números nuevos, hasta 150 para números con historial.</span>
            </div>
          </div>

          <!-- QR Section -->
          @if (saved() && form.whatsappProvider === 'waha') {
            <div class="qr-section">
              <div class="qr-header">
                <lucide-icon [img]="QrCode" [size]="20" style="color: var(--color-brand);"></lucide-icon>
                <span class="qr-title">Escanear QR para conectar</span>
                @if (waStatus()?.provider === 'waha' && waStatus()?.connected) {
                  <span class="badge-success">Conectado — {{ waStatus()?.instance }}</span>
                }
              </div>

              @if (!waStatus()?.connected || waStatus()?.provider !== 'waha') {
                <p style="font-size: 14px; color: var(--color-text-muted); margin-bottom: 20px;">
                  Abre WhatsApp en tu teléfono → <strong>Dispositivos vinculados</strong> → <strong>Vincular un dispositivo</strong> → Escanea el QR.
                </p>

                @if (qrLoading()) {
                  <div class="qr-placeholder">
                    <lucide-icon [img]="RefreshCw" [size]="32" class="spin" style="color: var(--color-text-muted);"></lucide-icon>
                    <span style="color: var(--color-text-muted);">Generando QR...</span>
                  </div>
                } @else if (qrCode()) {
                  <div class="qr-container">
                    <img [src]="qrCode()!" alt="QR WhatsApp" class="qr-image" />
                    <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 12px; text-align: center;">
                      El QR expira en ~45 segundos. Se actualiza automáticamente.
                    </p>
                  </div>
                } @else if (qrError()) {
                  <div class="error-box">{{ qrError() }}</div>
                }

                <button class="btn btn-secondary btn-sm" (click)="loadQr()" style="margin-top: 16px;">
                  <lucide-icon [img]="RefreshCw" [size]="14"></lucide-icon>
                  Actualizar QR
                </button>
              } @else {
                <div class="success-box">
                  <lucide-icon [img]="CheckCircle2" [size]="18"></lucide-icon>
                  WhatsApp conectado correctamente. Ya puedes enviar campañas.
                </div>
              }
            </div>
          }
        }

        <!-- WAHA test send -->
        @if (saved() && form.whatsappProvider === 'waha') {
          <div class="test-panel">
            <div class="test-panel-title">
              <lucide-icon [img]="MessageSquare" [size]="14"></lucide-icon>
              Probar envío
            </div>
            <div class="test-row">
              <input class="input" [(ngModel)]="testPhone" placeholder="Ej: 51999999999 (con código de país)" style="flex:1" />
              <button class="btn btn-secondary btn-sm" (click)="testWaha()" [disabled]="testLoading()">
                @if (testLoading()) {
                  <lucide-icon [img]="RefreshCw" [size]="13" class="spin"></lucide-icon>
                } @else {
                  <lucide-icon [img]="MessageSquare" [size]="13"></lucide-icon>
                }
                Enviar prueba
              </button>
            </div>
            @if (testResult()) {
              <div [class]="testResult()!.success ? 'success-box' : 'error-box'" style="margin-top:10px;white-space:pre-wrap;word-break:break-all;font-size:13px">
                @if (testResult()!.success) {
                  ✅ Mensaje enviado correctamente a {{ testResult()!.formattedPhone }}&#64;c.us
                } @else {
                  ❌ Error: {{ testResult()!.error }}
                  Provider: {{ testResult()!.provider }} · URL: {{ testResult()!.wahaApiUrl || '(vacío)' }} · Sesión: {{ testResult()!.wahaSession }}
                }
              </div>
            }
          </div>
        }

        <!-- Cloud API fields -->
        @if (form.whatsappProvider === 'cloudapi') {
          <div class="fields-grid">
            <div class="field">
              <label class="label">Phone Number ID *</label>
              <input class="input" [(ngModel)]="form.waPhoneNumberId" placeholder="123456789012345" />
              <span class="field-hint">WhatsApp → API Setup → From → Phone Number ID en Meta Developers</span>
            </div>
            <div class="field">
              <label class="label">Access Token *</label>
              <div class="input-wrap">
                <input class="input" [type]="showToken() ? 'text' : 'password'" [(ngModel)]="form.waAccessToken" placeholder="EAAAxxxxx..." />
                <button class="eye-btn" (click)="showToken.set(!showToken())" type="button">
                  <lucide-icon [img]="showToken() ? EyeOff : Eye" [size]="16"></lucide-icon>
                </button>
              </div>
              <span class="field-hint">Token permanente de System User en Meta Business Settings</span>
            </div>
            <div class="field">
              <label class="label">WhatsApp Business Account ID (WABA ID) *</label>
              <input class="input" [(ngModel)]="form.waBusinessAccountId" placeholder="123456789012345" />
              <span class="field-hint">Meta Business Suite → WhatsApp → Configuración de la cuenta. Necesario para gestionar plantillas.</span>
            </div>
          </div>

          @if (waStatus()?.provider === 'cloudapi' && waStatus()?.connected) {
            <div class="success-box" style="margin-top: 20px;">
              <lucide-icon [img]="CheckCircle2" [size]="18"></lucide-icon>
              Conectado — Número: <strong>{{ waStatus()?.phoneNumber }}</strong>
              @if (waStatus()?.state) { · {{ waStatus()?.state }} }
            </div>
          } @else if (waStatus()?.provider === 'cloudapi' && waStatus()?.error && saved()) {
            <div class="error-box" style="margin-top: 20px;">{{ waStatus()?.error }}</div>
          }
        }

        @if (form.whatsappProvider === 'none') {
          <p style="font-size: 14px; color: var(--color-text-muted); padding: 16px 0;">
            WhatsApp desactivado. Las campañas de tipo WhatsApp se registrarán como enviadas sin enviar mensajes reales.
          </p>
        }

        <!-- Save + docs link -->
        <div class="section-footer">
          <div style="display: flex; gap: 10px; align-items: center;">
            @if (waStatus() && form.whatsappProvider !== 'none') {
              <button class="btn btn-secondary btn-sm" (click)="checkStatus()" [disabled]="statusLoading()">
                <lucide-icon [img]="RefreshCw" [size]="14" [class.spin]="statusLoading()"></lucide-icon>
                Verificar conexión
              </button>
            }
            <button class="btn btn-primary" (click)="save()" [disabled]="saving()">
              <lucide-icon [img]="Save" [size]="16"></lucide-icon>
              {{ saving() ? 'Guardando...' : 'Guardar configuración' }}
            </button>
          </div>
        </div>
      </div>

      <!-- IA / Agentes Card -->
      <div class="section-card">
        <div class="section-header">
          <div class="section-icon" style="background: #EEF2FF;">
            <lucide-icon [img]="Sparkles" [size]="22" style="color: #4F46E5;"></lucide-icon>
          </div>
          <div>
            <h2 class="section-title">Inteligencia Artificial</h2>
            <p class="section-desc">API keys para los agentes de IA. Selecciona el proveedor en cada agente.</p>
          </div>
        </div>

        <div class="fields-grid">
          <div class="field">
            <label class="label">OpenAI API Key</label>
            <div class="input-wrap">
              <input class="input" [type]="showAiKey()['openai'] ? 'text' : 'password'" [(ngModel)]="form.openaiApiKey" placeholder="sk-..." />
              <button class="eye-btn" (click)="toggleAiKey('openai')" type="button">
                <lucide-icon [img]="showAiKey()['openai'] ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">platform.openai.com/api-keys</span>
          </div>
          <div class="field">
            <label class="label">DeepSeek API Key</label>
            <div class="input-wrap">
              <input class="input" [type]="showAiKey()['deepseek'] ? 'text' : 'password'" [(ngModel)]="form.deepseekApiKey" placeholder="sk-..." />
              <button class="eye-btn" (click)="toggleAiKey('deepseek')" type="button">
                <lucide-icon [img]="showAiKey()['deepseek'] ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">platform.deepseek.com</span>
          </div>
          <div class="field">
            <label class="label">Gemini API Key (Google)</label>
            <div class="input-wrap">
              <input class="input" [type]="showAiKey()['gemini'] ? 'text' : 'password'" [(ngModel)]="form.geminiApiKey" placeholder="AIza..." />
              <button class="eye-btn" (click)="toggleAiKey('gemini')" type="button">
                <lucide-icon [img]="showAiKey()['gemini'] ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">aistudio.google.com/apikey</span>
          </div>
          <div class="field">
            <label class="label">Claude API Key (Anthropic)</label>
            <div class="input-wrap">
              <input class="input" [type]="showAiKey()['claude'] ? 'text' : 'password'" [(ngModel)]="form.claudeApiKey" placeholder="sk-ant-..." />
              <button class="eye-btn" (click)="toggleAiKey('claude')" type="button">
                <lucide-icon [img]="showAiKey()['claude'] ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">console.anthropic.com</span>
          </div>
        </div>

        <div class="section-footer">
          <button class="btn btn-primary" (click)="saveAi()" [disabled]="savingAi()">
            <lucide-icon [img]="Save" [size]="16"></lucide-icon>
            {{ savingAi() ? 'Guardando...' : 'Guardar keys de IA' }}
          </button>
        </div>
      </div>

      <!-- Templates Card (Cloud API only) -->
      @if (savedProvider() === 'cloudapi' && saved()) {
        <div class="section-card">
          <div class="section-header">
            <div class="section-icon" style="background: #F5F3FF;">
              <lucide-icon [img]="Layout" [size]="22" style="color: #7C3AED;"></lucide-icon>
            </div>
            <div>
              <h2 class="section-title">Plantillas WhatsApp</h2>
              <p class="section-desc">Gestiona las plantillas aprobadas por Meta para campañas Cloud API</p>
            </div>
            <div style="margin-left: auto; display: flex; gap: 8px;">
              <button class="btn btn-secondary btn-sm" (click)="syncTemplates()" [disabled]="syncingTemplates()">
                <lucide-icon [img]="RefreshCw" [size]="14" [class.spin]="syncingTemplates()"></lucide-icon>
                Sincronizar desde Meta
              </button>
              <button class="btn btn-primary btn-sm" (click)="openTemplateModal()">
                <lucide-icon [img]="Plus" [size]="14"></lucide-icon>
                Nueva plantilla
              </button>
            </div>
          </div>

          @if (templatesLoading()) {
            <div style="text-align:center; padding: 24px; color: var(--color-text-muted); font-size: 14px;">
              <lucide-icon [img]="RefreshCw" [size]="20" class="spin" style="margin-bottom:8px;"></lucide-icon>
              <div>Cargando plantillas...</div>
            </div>
          } @else if (templates().length === 0) {
            <div style="text-align: center; padding: 32px 24px; color: var(--color-text-muted); font-size: 14px;">
              No hay plantillas. Haz clic en <strong>Sincronizar desde Meta</strong> para importar las plantillas existentes, o crea una nueva.
            </div>
          } @else {
            <div class="templates-list">
              @for (t of templates(); track t._id) {
                <div class="tpl-row">
                  <div class="tpl-row-main">
                    <div class="tpl-name">{{ t.name }}</div>
                    <div class="tpl-body">{{ t.body.substring(0, 80) }}{{ t.body.length > 80 ? '…' : '' }}</div>
                  </div>
                  <div class="tpl-badges">
                    <span class="tpl-badge tpl-status-{{ t.status.toLowerCase() }}">{{ t.status }}</span>
                    <span class="tpl-badge tpl-lang">{{ t.language }}</span>
                    <span class="tpl-badge tpl-cat">{{ t.category }}</span>
                  </div>
                  <button class="btn btn-icon btn-ghost btn-sm tpl-del-btn" (click)="deleteTemplate(t)">
                    <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                  </button>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- Template Create Modal -->
    @if (templateModalOpen()) {
      <div class="overlay" (click)="closeTemplateModal()">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3 class="modal-title">Nueva plantilla</h3>
            <button class="btn btn-icon btn-ghost btn-sm" (click)="closeTemplateModal()">
              <lucide-icon [img]="X" [size]="18"></lucide-icon>
            </button>
          </div>
          <div class="modal-body">
            @if (tplError()) {
              <div class="error-box" style="margin-bottom: 16px;">{{ tplError() }}</div>
            }
            <div class="field">
              <label class="label">Nombre (solo minúsculas, números, guiones bajos) *</label>
              <input class="input" [(ngModel)]="tplForm.name" placeholder="promo_verano_2026" />
            </div>
            <div class="field">
              <label class="label">Categoría *</label>
              <select class="select" [(ngModel)]="tplForm.category">
                <option value="MARKETING">MARKETING — Promociones y ofertas</option>
                <option value="UTILITY">UTILITY — Confirmaciones, recordatorios</option>
                <option value="AUTHENTICATION">AUTHENTICATION — Códigos de verificación</option>
              </select>
            </div>
            <div class="field">
              <label class="label">Idioma *</label>
              <select class="select" [(ngModel)]="tplForm.language">
                <option value="es">Español (es)</option>
                <option value="es_MX">Español México (es_MX)</option>
                <option value="es_AR">Español Argentina (es_AR)</option>
                <option value="en_US">English (en_US)</option>
                <option value="pt_BR">Português Brasil (pt_BR)</option>
              </select>
            </div>
            <div class="field">
              <label class="label">Encabezado (opcional)</label>
              <input class="input" [(ngModel)]="tplForm.headerText" placeholder="Texto del encabezado" />
            </div>
            <div class="field">
              <label class="label">Cuerpo del mensaje *</label>
              <div class="field-hint" style="margin-bottom: 4px;">Usa &#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125;, etc. para variables dinámicas.</div>
              <textarea class="textarea" [(ngModel)]="tplForm.body" rows="4"
                placeholder="Hola {{1}}, tenemos una oferta especial: {{2}} de descuento esta semana."></textarea>
            </div>
            <div class="field">
              <label class="label">Pie de mensaje (opcional)</label>
              <input class="input" [(ngModel)]="tplForm.footer" placeholder="Responde STOP para dejar de recibir mensajes" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeTemplateModal()">Cancelar</button>
            <button class="btn btn-primary" (click)="createTemplate()" [disabled]="savingTemplate()">
              {{ savingTemplate() ? 'Enviando a Meta...' : 'Crear plantilla' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page {
      width: 100%;
      box-sizing: border-box;
      padding: 32px 40px;
      max-width: 900px;
    }

    .page-header { margin-bottom: 32px; }

    .page-title {
      font-family: var(--font-heading);
      font-size: 26px;
      font-weight: 700;
      color: var(--color-text-main);
      margin: 0 0 4px;
    }

    .page-subtitle { font-size: 14px; color: var(--color-text-muted); margin: 0; }

    .section-card {
      background: var(--color-white);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: 28px 32px;
      margin-bottom: 24px;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }

    .section-icon {
      width: 44px; height: 44px;
      border-radius: var(--radius-lg);
      background: #F0FDF4;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc { font-size: 13px; color: var(--color-text-muted); margin: 0; }

    .status-pill {
      margin-left: auto;
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 600;
      padding: 6px 12px; border-radius: var(--radius-pill);
      background: var(--color-bg-app); color: var(--color-text-muted);
      border: 1px solid var(--color-border); white-space: nowrap;
    }
    .status-pill.connected { background: #F0FDF4; color: #16A34A; border-color: #BBF7D0; }
    .status-pill.disconnected { background: #FEF2F2; color: var(--color-error); border-color: #FECACA; }

    .provider-tabs {
      display: flex; gap: 8px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--color-border);
    }

    .provider-tab {
      padding: 10px 20px; border: none; background: transparent;
      color: var(--color-text-muted); font-size: 14px; font-weight: 600;
      cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
      transition: all var(--transition-fast);
    }
    .provider-tab:hover { color: var(--color-text-main); }
    .provider-tab.active { color: var(--color-brand); border-bottom-color: var(--color-brand); }

    .fields-grid { display: flex; flex-direction: column; gap: 20px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .field-hint { font-size: 12px; color: var(--color-text-muted); }

    .input-wrap { position: relative; display: flex; }
    .input-wrap .input { padding-right: 44px; flex: 1; }
    .eye-btn {
      position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
      background: none; border: none; cursor: pointer; color: var(--color-text-muted);
      display: flex; align-items: center;
    }
    .eye-btn:hover { color: var(--color-text-main); }

    .qr-section {
      margin-top: 28px; padding-top: 28px;
      border-top: 1px solid var(--color-border);
    }
    .qr-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .qr-title { font-size: 15px; font-weight: 700; color: var(--color-text-main); }
    .qr-placeholder {
      width: 256px; height: 256px;
      border: 2px dashed var(--color-border); border-radius: var(--radius-lg);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
    }
    .qr-container { display: flex; flex-direction: column; align-items: flex-start; }
    .qr-image {
      width: 256px; height: 256px;
      border-radius: var(--radius-lg); border: 4px solid var(--color-white);
      box-shadow: var(--shadow-lg);
    }

    .error-box {
      padding: 12px 16px;
      background: #FEF2F2; border: 1px solid #FECACA;
      border-radius: var(--radius-lg); font-size: 13px; color: var(--color-error);
    }
    .success-box {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 18px; background: #F0FDF4; border: 1px solid #BBF7D0;
      border-radius: var(--radius-lg); font-size: 14px; color: #15803D;
    }
    .badge-success {
      margin-left: auto; background: #DCFCE7; color: #15803D;
      font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: var(--radius-pill);
    }

    .test-panel {
      margin-top: 20px; padding: 16px; background: var(--color-bg-app);
      border: 1px solid var(--color-border); border-radius: var(--radius-lg);
    }
    .test-panel-title {
      display: flex; align-items: center; gap: 6px;
      font-size: 13px; font-weight: 700; color: var(--color-text-main); margin-bottom: 10px;
    }
    .test-row { display: flex; align-items: center; gap: 8px; }

    .section-footer {
      display: flex; align-items: center; justify-content: flex-end;
      margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--color-border);
    }

    /* Templates list */
    .templates-list { display: flex; flex-direction: column; gap: 0; }
    .tpl-row {
      display: flex; align-items: center; gap: 16px;
      padding: 14px 0; border-bottom: 1px solid var(--color-border);
    }
    .tpl-row:last-child { border-bottom: none; }
    .tpl-row-main { flex: 1; min-width: 0; }
    .tpl-name { font-weight: 700; font-size: 13px; color: var(--color-text-main); font-family: monospace; }
    .tpl-body { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tpl-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .tpl-badge {
      font-size: 11px; font-weight: 700; padding: 3px 8px;
      border-radius: var(--radius-pill); background: var(--color-bg-app);
      color: var(--color-text-muted); border: 1px solid var(--color-border);
    }
    .tpl-status-approved { background: #F0FDF4; color: #15803D; border-color: #BBF7D0; }
    .tpl-status-pending  { background: #FEFCE8; color: #854D0E; border-color: #FEF08A; }
    .tpl-status-rejected { background: #FEF2F2; color: #DC2626; border-color: #FECACA; }
    .tpl-del-btn { color: var(--color-text-muted) !important; flex-shrink: 0; }
    .tpl-del-btn:hover { color: var(--color-error) !important; background: #FEF2F2 !important; }

    /* Modal */
    .overlay {
      position: fixed; inset: 0;
      background: rgba(15,23,42,0.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .modal-card {
      background: var(--color-white);
      border-radius: var(--radius-lg);
      width: calc(100% - 48px);
      max-width: 520px;
      box-shadow: var(--shadow-lg);
      display: flex; flex-direction: column;
      max-height: 90vh;
    }
    .modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 24px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
    }
    .modal-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0; }
    .modal-body {
      padding: 20px 24px; overflow-y: auto; flex: 1;
      display: flex; flex-direction: column; gap: 16px;
    }
    .modal-footer {
      padding: 16px 24px; border-top: 1px solid var(--color-border);
      display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; display: inline-block; }
  `],
})
export class SettingsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly MessageSquare = MessageSquare;
  readonly CheckCircle2 = CheckCircle2;
  readonly XCircle = XCircle;
  readonly RefreshCw = RefreshCw;
  readonly Save = Save;
  readonly Wifi = Wifi;
  readonly WifiOff = WifiOff;
  readonly QrCode = QrCode;
  readonly ExternalLink = ExternalLink;
  readonly Eye = Eye;
  readonly EyeOff = EyeOff;
  readonly Plus = Plus;
  readonly Trash2 = Trash2;
  readonly X = X;
  readonly Layout = Layout;
  readonly Sparkles = Sparkles;

  form: TenantConfig = {
    whatsappProvider: 'none',
    wahaApiUrl: '',
    wahaApiKey: '',
    wahaSession: 'default',
    waPhoneNumberId: '',
    waAccessToken: '',
    waBusinessAccountId: '',
    waDailyLimit: 50,
    openaiApiKey: '',
    deepseekApiKey: '',
    geminiApiKey: '',
    claudeApiKey: '',
  };

  showAiKey = signal<Record<string, boolean>>({});
  savingAi = signal(false);
  toggleAiKey(k: string) { this.showAiKey.update(m => ({ ...m, [k]: !m[k] })); }

  saving = signal(false);
  saved = signal(false);
  savedProvider = signal('none');
  statusLoading = signal(false);
  qrLoading = signal(false);
  waStatus = signal<WaStatus | null>(null);
  qrCode = signal<string | null>(null);
  qrError = signal('');
  showKey = signal(false);
  showToken = signal(false);
  testPhone = '';
  testLoading = signal(false);
  testResult = signal<{ success: boolean; provider: string; wahaApiUrl?: string; wahaSession?: string; formattedPhone: string; error?: string } | null>(null);

  templates = signal<WaTemplate[]>([]);
  templatesLoading = signal(false);
  syncingTemplates = signal(false);
  templateModalOpen = signal(false);
  savingTemplate = signal(false);
  tplError = signal('');

  tplForm = {
    name: '',
    category: 'MARKETING' as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
    language: 'es',
    body: '',
    headerText: '',
    footer: '',
  };

  private qrInterval: ReturnType<typeof setInterval> | null = null;
  private statusInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit() { this.loadConfig(); }
  ngOnDestroy() { this.stopPolling(); }

  @HostListener('document:keydown.escape')
  onEsc() { if (this.templateModalOpen()) this.closeTemplateModal(); }

  setProvider(p: string) {
    this.form.whatsappProvider = p;
    this.qrCode.set(null);
    this.qrError.set('');
    this.stopPolling();
    if (p !== this.savedProvider()) {
      this.waStatus.set(null);
    } else {
      this.checkStatus();
    }
    if (p === 'cloudapi' && this.saved()) this.loadTemplates();
  }

  loadConfig() {
    this.http.get<TenantConfig>(`${API}/settings`).subscribe({
      next: (cfg) => {
        if (cfg) {
          this.form = {
            whatsappProvider: cfg.whatsappProvider ?? 'none',
            wahaApiUrl: cfg.wahaApiUrl ?? '',
            wahaApiKey: cfg.wahaApiKey ?? '',
            wahaSession: cfg.wahaSession ?? 'default',
            waPhoneNumberId: cfg.waPhoneNumberId ?? '',
            waAccessToken: cfg.waAccessToken ?? '',
            waBusinessAccountId: cfg.waBusinessAccountId ?? '',
            waDailyLimit: cfg.waDailyLimit ?? 50,
            openaiApiKey: cfg.openaiApiKey ?? '',
            deepseekApiKey: cfg.deepseekApiKey ?? '',
            geminiApiKey: cfg.geminiApiKey ?? '',
            claudeApiKey: cfg.claudeApiKey ?? '',
          };
          this.saved.set(true);
          this.savedProvider.set(cfg.whatsappProvider ?? 'none');
          this.checkStatus();
          if (cfg.whatsappProvider === 'cloudapi') this.loadTemplates();
        }
      },
      error: () => {},
    });
  }

  save() {
    this.saving.set(true);
    const dto = { ...this.form, waDailyLimit: Number(this.form.waDailyLimit) || 50 };
    this.http.put<TenantConfig>(`${API}/settings`, dto).subscribe({
      next: () => {
        this.toast.success('Configuración guardada');
        this.saving.set(false);
        this.saved.set(true);
        this.savedProvider.set(this.form.whatsappProvider);
        this.checkStatus();
        if (this.form.whatsappProvider === 'waha') {
          this.loadQr();
          this.startStatusPolling();
        }
        if (this.form.whatsappProvider === 'cloudapi') this.loadTemplates();
      },
      error: (err: { error?: { message?: string } }) => {
        this.toast.error(err.error?.message || 'Error al guardar');
        this.saving.set(false);
      },
    });
  }

  saveAi() {
    this.savingAi.set(true);
    this.http.put<TenantConfig>(`${API}/settings`, { ...this.form, waDailyLimit: Number(this.form.waDailyLimit) || 50 }).subscribe({
      next: () => {
        this.toast.success('API keys de IA guardadas');
        this.savingAi.set(false);
        this.saved.set(true);
      },
      error: (err: { error?: { message?: string } }) => {
        this.toast.error(err.error?.message || 'Error al guardar');
        this.savingAi.set(false);
      },
    });
  }

  checkStatus() {
    this.statusLoading.set(true);
    this.http.get<WaStatus>(`${API}/settings/whatsapp/status`).subscribe({
      next: (s) => {
        this.waStatus.set(s);
        this.statusLoading.set(false);
        if (s.connected && this.qrInterval) this.stopPolling();
      },
      error: () => this.statusLoading.set(false),
    });
  }

  testWaha() {
    if (!this.testPhone.trim()) { this.toast.error('Ingresa un número de teléfono'); return; }
    this.testLoading.set(true);
    this.testResult.set(null);
    this.http.post<{ success: boolean; provider: string; wahaApiUrl?: string; wahaSession?: string; formattedPhone: string; error?: string }>(
      `${API}/settings/whatsapp/test`, { phone: this.testPhone }
    ).subscribe({
      next: (r) => { this.testResult.set(r); this.testLoading.set(false); },
      error: (err: { error?: { message?: string } }) => {
        this.testResult.set({ success: false, provider: '?', formattedPhone: this.testPhone, error: err.error?.message || 'Error de red' });
        this.testLoading.set(false);
      },
    });
  }

  loadQr() {
    this.qrLoading.set(true);
    this.qrError.set('');
    this.http.get<{ qrcode?: string; error?: string }>(`${API}/settings/whatsapp/qr`).subscribe({
      next: (r) => {
        this.qrLoading.set(false);
        if (r.qrcode) {
          const src = r.qrcode.startsWith('data:') ? r.qrcode : `data:image/png;base64,${r.qrcode}`;
          this.qrCode.set(src);
        } else {
          this.qrError.set(r.error ?? 'No se pudo obtener el QR');
        }
      },
      error: () => {
        this.qrLoading.set(false);
        this.qrError.set('Error al conectar con WAHA');
      },
    });
  }

  loadTemplates() {
    if (this.templatesLoading()) return;
    this.templatesLoading.set(true);
    this.http.get<WaTemplate[]>(`${API}/settings/templates`).subscribe({
      next: (data) => { this.templates.set(data); this.templatesLoading.set(false); },
      error: () => this.templatesLoading.set(false),
    });
  }

  syncTemplates() {
    this.syncingTemplates.set(true);
    this.http.post<WaTemplate[]>(`${API}/settings/templates/sync`, {}).subscribe({
      next: (data) => {
        this.templates.set(data);
        this.syncingTemplates.set(false);
        this.toast.success(`${data.length} plantilla(s) sincronizadas desde Meta`);
      },
      error: (err: { error?: { message?: string } }) => {
        this.syncingTemplates.set(false);
        this.toast.error(err.error?.message || 'Error al sincronizar plantillas');
      },
    });
  }

  openTemplateModal() {
    this.tplForm = { name: '', category: 'MARKETING', language: 'es', body: '', headerText: '', footer: '' };
    this.tplError.set('');
    this.templateModalOpen.set(true);
  }

  closeTemplateModal() { this.templateModalOpen.set(false); }

  createTemplate() {
    if (!this.tplForm.name.trim()) { this.tplError.set('El nombre es obligatorio'); return; }
    if (!this.tplForm.body.trim()) { this.tplError.set('El cuerpo del mensaje es obligatorio'); return; }
    this.savingTemplate.set(true);
    this.tplError.set('');
    const dto = {
      name: this.tplForm.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      category: this.tplForm.category,
      language: this.tplForm.language,
      body: this.tplForm.body.trim(),
      headerText: this.tplForm.headerText?.trim() || undefined,
      footer: this.tplForm.footer?.trim() || undefined,
    };
    this.http.post<WaTemplate>(`${API}/settings/templates`, dto).subscribe({
      next: (t) => {
        this.templates.update(list => [...list, t]);
        this.savingTemplate.set(false);
        this.closeTemplateModal();
        this.toast.success('Plantilla creada. Pendiente de aprobación por Meta.');
      },
      error: (err: { error?: { message?: string } }) => {
        this.tplError.set(err.error?.message || 'Error al crear plantilla');
        this.savingTemplate.set(false);
      },
    });
  }

  async deleteTemplate(t: WaTemplate) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar plantilla',
      message: `¿Eliminar la plantilla "${t.name}"? Esta acción también la eliminará de Meta.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/settings/templates/${t._id}`).subscribe({
      next: () => {
        this.templates.update(list => list.filter(x => x._id !== t._id));
        this.toast.success('Plantilla eliminada');
      },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }

  private startStatusPolling() {
    this.stopPolling();
    this.qrInterval = setInterval(() => {
      if (!this.waStatus()?.connected) this.loadQr();
    }, 18000);
    this.statusInterval = setInterval(() => this.checkStatus(), 5000);
  }

  private stopPolling() {
    if (this.qrInterval) { clearInterval(this.qrInterval); this.qrInterval = null; }
    if (this.statusInterval) { clearInterval(this.statusInterval); this.statusInterval = null; }
  }
}
