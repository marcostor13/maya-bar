import { Component, inject, signal, computed, OnInit, OnDestroy, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, MessageSquare, CheckCircle2, XCircle, RefreshCw,
  Save, WifiOff, QrCode, Eye, EyeOff, Plus, Trash2, X, Layout, Sparkles,
  Smartphone, Pencil, Star, Webhook, Instagram, Link
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

interface AiKeys {
  waDailyLimit?: number;
  openaiApiKey?: string;
  deepseekApiKey?: string;
  geminiApiKey?: string;
  claudeApiKey?: string;
}

interface WaAccount {
  _id: string;
  label: string;
  provider: 'waha' | 'cloudapi';
  phoneNumber?: string;
  wahaApiUrl?: string;
  wahaApiKey?: string;
  wahaSession?: string;
  waPhoneNumberId?: string;
  waAccessToken?: string;
  waBusinessAccountId?: string;
  waVerifyToken?: string;
  tokenExpiresAt?: string;
  active: boolean;
  isDefault?: boolean;
}

interface IgAccount {
  _id: string;
  label: string;
  username?: string;
  igBusinessAccountId?: string;
  pageId?: string;
  pageAccessToken?: string;
  tokenExpiresAt?: string;
  active: boolean;
}

declare const FB: any;

interface WaStatus {
  connected: boolean;
  state?: string;
  phoneNumber?: string;
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

function blankAccount(): WaAccount {
  return {
    _id: '', label: '', provider: 'waha', phoneNumber: '', wahaApiUrl: '', wahaApiKey: '',
    wahaSession: 'default', waPhoneNumberId: '', waAccessToken: '', waBusinessAccountId: '',
    waVerifyToken: '', active: true,
  };
}

function blankIgAccount(): IgAccount {
  return {
    _id: '', label: '', username: '', igBusinessAccountId: '', pageId: '',
    pageAccessToken: '', active: true,
  };
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">Configuración</h1>
          <p class="page-subtitle">Integraciones y ajustes de la plataforma</p>
        </div>
      </div>

      <!-- WhatsApp Accounts Card -->
      <div class="section-card">
        <div class="section-header">
          <div class="section-icon">
            <lucide-icon [img]="MessageSquare" [size]="22" style="color: #16A34A;"></lucide-icon>
          </div>
          <div>
            <h2 class="section-title">WhatsApp</h2>
            <p class="section-desc">Conecta uno o varios números vía WAHA o Cloud API. La cuenta predeterminada se usa para campañas y envíos.</p>
          </div>
        </div>

        @if (!accForm()) {
          <button class="btn btn-primary" style="margin-bottom:20px" [disabled]="connectingWa()" (click)="connectWhatsApp()">
            <lucide-icon [img]="Smartphone" [size]="16"></lucide-icon>
            {{ connectingWa() ? 'Conectando…' : 'Conectar con WhatsApp' }}
          </button>

          <div class="field" style="max-width: 260px; margin-bottom: 20px;">
            <label class="label">Límite diario de mensajes</label>
            <input class="input" type="number" [(ngModel)]="dailyLimit" min="1" max="500" placeholder="50"
              (change)="saveDailyLimit()" />
            <span class="field-hint">Aplica a todo el tenant. 50 para números nuevos, hasta 150 con historial.</span>
          </div>

          @if (accountsLoading()) {
            <div class="loading-row">
              <lucide-icon [img]="RefreshCw" [size]="20" class="spin"></lucide-icon> Cargando cuentas…
            </div>
          } @else if (accounts().length === 0) {
            <div class="empty-accounts">
              <lucide-icon [img]="Smartphone" [size]="28" [strokeWidth]="1.5" style="color: var(--color-text-muted);"></lucide-icon>
              <p>Aún no hay cuentas de WhatsApp.</p>
            </div>
          } @else {
            <div class="acc-list">
              @for (acc of accounts(); track acc._id) {
                <div class="acc-card">
                  <div class="acc-card-head">
                    <div class="acc-id">
                      <span class="account-label">{{ acc.label }}</span>
                      @if (acc.isDefault) {
                        <span class="badge-default"><lucide-icon [img]="Star" [size]="11"></lucide-icon> Predeterminada</span>
                      }
                      <span class="account-sub">{{ acc.provider === 'waha' ? 'WAHA' : 'Cloud API' }}{{ acc.phoneNumber ? ' · ' + acc.phoneNumber : '' }}</span>
                    </div>
                    <div class="acc-card-actions">
                      @if (!acc.isDefault) {
                        <button class="btn btn-sm btn-ghost btn-icon" (click)="setDefault(acc)" title="Marcar como predeterminada">
                          <lucide-icon [img]="Star" [size]="14"></lucide-icon>
                        </button>
                      }
                      @if (acc.tokenExpiresAt) {
                        <button class="btn btn-sm btn-ghost btn-icon" (click)="renewWaToken(acc)" title="Renovar token">
                          <lucide-icon [img]="RefreshCw" [size]="14" style="color: var(--color-brand);"></lucide-icon>
                        </button>
                      }
                      @if (acc.provider === 'cloudapi') {
                        <button class="btn btn-sm btn-ghost btn-icon" (click)="configureWebhook(acc)" [disabled]="webhookLoading() === acc._id" title="Suscribir webhook">
                          <lucide-icon [img]="Link" [size]="14" [class.spin]="webhookLoading() === acc._id"></lucide-icon>
                        </button>
                      }
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="checkStatus(acc)" title="Verificar estado">
                        <lucide-icon [img]="RefreshCw" [size]="14"></lucide-icon>
                      </button>
                      @if (acc.provider === 'waha') {
                        <button class="btn btn-sm btn-ghost btn-icon" (click)="toggleQr(acc)" title="Conectar (QR)">
                          <lucide-icon [img]="QrCode" [size]="14"></lucide-icon>
                        </button>
                        <button class="btn btn-sm btn-ghost btn-icon" (click)="configureWebhook(acc)" [disabled]="webhookLoading() === acc._id" title="Reconfigurar webhook">
                          <lucide-icon [img]="Webhook" [size]="14" [class.spin]="webhookLoading() === acc._id"></lucide-icon>
                        </button>
                      }
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="toggleTest(acc)" title="Probar envío">
                        <lucide-icon [img]="MessageSquare" [size]="14"></lucide-icon>
                      </button>
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="editAccount(acc)" title="Editar">
                        <lucide-icon [img]="Pencil" [size]="14"></lucide-icon>
                      </button>
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="deleteAccount(acc)" title="Eliminar">
                        <lucide-icon [img]="Trash2" [size]="14" style="color: var(--color-error);"></lucide-icon>
                      </button>
                    </div>
                  </div>

                  @if (statusMap()[acc._id]) {
                    <div class="acc-status" [class.ok]="statusMap()[acc._id].connected">
                      @if (statusMap()[acc._id].connected) {
                        <lucide-icon [img]="CheckCircle2" [size]="13"></lucide-icon> Conectado
                      } @else {
                        <lucide-icon [img]="WifiOff" [size]="13"></lucide-icon> Desconectado
                      }
                      {{ statusMap()[acc._id].state ? '· ' + statusMap()[acc._id].state : '' }}
                      {{ statusMap()[acc._id].error || '' }}
                    </div>
                  }

                  @if (acc.tokenExpiresAt) {
                    <div class="webhook-hint">
                      <span>Token vence:</span> {{ acc.tokenExpiresAt | date:'d MMM y' }}
                    </div>
                  }

                  <!-- QR panel -->
                  @if (qrActiveId() === acc._id) {
                    <div class="acc-panel">
                      <p class="panel-hint">WhatsApp → Dispositivos vinculados → Vincular un dispositivo → escanea:</p>
                      @if (qrLoading()) {
                        <div class="qr-placeholder">
                          <lucide-icon [img]="RefreshCw" [size]="28" class="spin" style="color: var(--color-text-muted);"></lucide-icon>
                        </div>
                      } @else if (qrMap()[acc._id]) {
                        <img [src]="qrMap()[acc._id]" alt="QR WhatsApp" class="qr-image" />
                      } @else if (qrError()) {
                        <div class="error-box">{{ qrError() }}</div>
                      }
                      <button class="btn btn-secondary btn-sm" (click)="loadQr(acc)" style="margin-top: 12px;">
                        <lucide-icon [img]="RefreshCw" [size]="13"></lucide-icon> Actualizar QR
                      </button>
                    </div>
                  }

                  <!-- Test panel -->
                  @if (testActiveId() === acc._id) {
                    <div class="acc-panel">
                      <div class="test-row">
                        <input class="input" [(ngModel)]="testPhone" placeholder="51999999999 (con código de país)" style="flex:1" />
                        <button class="btn btn-secondary btn-sm" (click)="testAccount(acc)" [disabled]="testLoading()">
                          @if (testLoading()) { <lucide-icon [img]="RefreshCw" [size]="13" class="spin"></lucide-icon> }
                          @else { <lucide-icon [img]="MessageSquare" [size]="13"></lucide-icon> }
                          Enviar prueba
                        </button>
                      </div>
                      @if (testResult()) {
                        <div [class]="testResult()!.success ? 'success-box' : 'error-box'" style="margin-top:10px;font-size:13px">
                          @if (testResult()!.success) { ✅ Enviado a {{ testResult()!.formattedPhone }}&#64;c.us }
                          @else { ❌ {{ testResult()!.error }} }
                        </div>
                      }
                    </div>
                  }

                  <div class="webhook-hint">
                    <span>Webhook entrante:</span>
                    <code>{{ webhookUrl(acc) }}</code>
                  </div>
                </div>
              }
            </div>
          }

          <button class="btn btn-ghost" style="margin-top: 16px;" (click)="newAccount()">
            <lucide-icon [img]="Plus" [size]="16"></lucide-icon> Añadir manualmente (WAHA / avanzado)
          </button>
        } @else {
          <!-- Account form -->
          <div class="fields-grid">
            <div class="field">
              <label class="label">Nombre de la cuenta *</label>
              <input class="input" [(ngModel)]="accForm()!.label" placeholder="Ej: Línea Reservas" />
            </div>
            <div class="field">
              <label class="label">Proveedor *</label>
              <select class="select" [(ngModel)]="accForm()!.provider">
                <option value="waha">WAHA</option>
                <option value="cloudapi">WhatsApp Cloud API</option>
              </select>
            </div>
            <div class="field">
              <label class="label">Número (informativo)</label>
              <input class="input" [(ngModel)]="accForm()!.phoneNumber" placeholder="+51 999 999 999" />
            </div>

            @if (accForm()!.provider === 'waha') {
              <div class="field">
                <label class="label">URL de WAHA *</label>
                <input class="input" [(ngModel)]="accForm()!.wahaApiUrl" placeholder="https://waha.midominio.com" />
              </div>
              <div class="field">
                <label class="label">API Key</label>
                <div class="input-wrap">
                  <input class="input" [type]="showKey() ? 'text' : 'password'" [(ngModel)]="accForm()!.wahaApiKey" placeholder="X-Api-Key" />
                  <button class="eye-btn" (click)="showKey.set(!showKey())" type="button">
                    <lucide-icon [img]="showKey() ? EyeOff : Eye" [size]="16"></lucide-icon>
                  </button>
                </div>
              </div>
              <div class="field">
                <label class="label">Nombre de sesión</label>
                <input class="input" [(ngModel)]="accForm()!.wahaSession" placeholder="default" />
              </div>
            } @else {
              <div class="field">
                <label class="label">Phone Number ID *</label>
                <input class="input" [(ngModel)]="accForm()!.waPhoneNumberId" placeholder="1234567890" />
              </div>
              <div class="field">
                <label class="label">Access Token *</label>
                <div class="input-wrap">
                  <input class="input" [type]="showToken() ? 'text' : 'password'" [(ngModel)]="accForm()!.waAccessToken" placeholder="EAAG…" />
                  <button class="eye-btn" (click)="showToken.set(!showToken())" type="button">
                    <lucide-icon [img]="showToken() ? EyeOff : Eye" [size]="16"></lucide-icon>
                  </button>
                </div>
              </div>
              <div class="field">
                <label class="label">WhatsApp Business Account ID</label>
                <input class="input" [(ngModel)]="accForm()!.waBusinessAccountId" placeholder="(opcional, para plantillas)" />
              </div>
              <div class="field">
                <label class="label">Verify Token (webhook)</label>
                <input class="input" [(ngModel)]="accForm()!.waVerifyToken" placeholder="token-secreto-para-meta" />
              </div>
            }
          </div>

          <div class="section-footer" style="justify-content: space-between;">
            <button class="btn btn-ghost" (click)="accForm.set(null)">Cancelar</button>
            <button class="btn btn-primary" [disabled]="savingAcc()" (click)="saveAccount()">
              <lucide-icon [img]="Save" [size]="16"></lucide-icon>
              {{ savingAcc() ? 'Guardando…' : 'Guardar cuenta' }}
            </button>
          </div>
        }
      </div>

      <!-- Instagram Accounts Card -->
      <div class="section-card">
        <div class="section-header">
          <div class="section-icon" style="background: #FCE7F3;">
            <lucide-icon [img]="Instagram" [size]="22" style="color: #DB2777;"></lucide-icon>
          </div>
          <div>
            <h2 class="section-title">Instagram</h2>
            <p class="section-desc">Conecta uno o varios DM de Instagram. Estas cuentas quedan disponibles para los agentes de IA.</p>
          </div>
        </div>

        @if (!igAccForm()) {
          <button class="btn btn-primary" style="margin-bottom:16px" [disabled]="connectingIg()" (click)="connectInstagram()">
            <lucide-icon [img]="Instagram" [size]="16"></lucide-icon>
            {{ connectingIg() ? 'Redirigiendo…' : 'Conectar con Instagram' }}
          </button>

          @if (igAccountsLoading()) {
            <div class="loading-row">
              <lucide-icon [img]="RefreshCw" [size]="20" class="spin"></lucide-icon> Cargando cuentas…
            </div>
          } @else if (igAccounts().length === 0) {
            <div class="empty-accounts">
              <lucide-icon [img]="Instagram" [size]="28" [strokeWidth]="1.5" style="color: var(--color-text-muted);"></lucide-icon>
              <p>Aún no hay cuentas de Instagram.</p>
            </div>
          } @else {
            <div class="webhook-hint" style="margin-bottom:16px">
              <span>Webhook de la app (se configura una sola vez en Meta, aplica a todas las cuentas):</span>
              <code>{{ igWebhookUrl() }}</code>
            </div>
            <div class="acc-list">
              @for (acc of igAccounts(); track acc._id) {
                <div class="acc-card">
                  <div class="acc-card-head">
                    <div class="acc-id">
                      <span class="account-label">{{ acc.label }}</span>
                      <span class="account-sub">{{ acc.username ? '@' + acc.username : 'Instagram Messaging' }}</span>
                    </div>
                    <div class="acc-card-actions">
                      @if (acc.tokenExpiresAt) {
                        <button class="btn btn-sm btn-ghost btn-icon" (click)="renewIgToken(acc)" title="Renovar token">
                          <lucide-icon [img]="RefreshCw" [size]="14" style="color: var(--color-brand);"></lucide-icon>
                        </button>
                      }
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="subscribeIgWebhook(acc)" title="Suscribir webhook">
                        <lucide-icon [img]="Link" [size]="14"></lucide-icon>
                      </button>
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="checkIgStatus(acc)" title="Verificar estado">
                        <lucide-icon [img]="RefreshCw" [size]="14"></lucide-icon>
                      </button>
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="editIgAccount(acc)" title="Editar">
                        <lucide-icon [img]="Pencil" [size]="14"></lucide-icon>
                      </button>
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="deleteIgAccount(acc)" title="Eliminar">
                        <lucide-icon [img]="Trash2" [size]="14" style="color: var(--color-error);"></lucide-icon>
                      </button>
                    </div>
                  </div>

                  @if (igStatusMap()[acc._id]) {
                    <div class="acc-status" [class.ok]="igStatusMap()[acc._id].connected">
                      @if (igStatusMap()[acc._id].connected) {
                        <lucide-icon [img]="CheckCircle2" [size]="13"></lucide-icon> Conectado
                      } @else {
                        <lucide-icon [img]="WifiOff" [size]="13"></lucide-icon> Desconectado
                      }
                      {{ igStatusMap()[acc._id].username ? '· @' + igStatusMap()[acc._id].username : '' }}
                      {{ igStatusMap()[acc._id].error || '' }}
                    </div>
                  }

                  @if (acc.tokenExpiresAt) {
                    <div class="webhook-hint">
                      <span>Token vence:</span> {{ acc.tokenExpiresAt | date:'d MMM y' }}
                    </div>
                  }
                </div>
              }
            </div>
          }

          <button class="btn btn-ghost" style="margin-top: 16px;" (click)="newIgAccount()">
            <lucide-icon [img]="Plus" [size]="16"></lucide-icon> Añadir manualmente (avanzado)
          </button>
        } @else {
          <!-- Instagram account form -->
          <div class="fields-grid">
            <div class="field">
              <label class="label">Nombre de la cuenta *</label>
              <input class="input" [(ngModel)]="igAccForm()!.label" placeholder="Ej: Instagram Principal" />
            </div>
            <div class="field">
              <label class="label">Usuario (informativo)</label>
              <input class="input" [(ngModel)]="igAccForm()!.username" placeholder="mi_restaurante" />
            </div>
            <div class="field">
              <label class="label">Instagram User ID *</label>
              <input class="input" [(ngModel)]="igAccForm()!.igBusinessAccountId" placeholder="1789…" />
              <span class="field-hint">ID de la cuenta profesional de Instagram (Instagram Login).</span>
            </div>
            <div class="field">
              <label class="label">Access Token de Instagram *</label>
              <div class="input-wrap">
                <input class="input" [type]="showIgToken() ? 'text' : 'password'" [(ngModel)]="igAccForm()!.pageAccessToken" placeholder="IGAAG…" />
                <button class="eye-btn" (click)="showIgToken.set(!showIgToken())" type="button">
                  <lucide-icon [img]="showIgToken() ? EyeOff : Eye" [size]="16"></lucide-icon>
                </button>
              </div>
              <span class="field-hint">Token de larga duración (instagram_business_basic + instagram_business_manage_messages). Tras guardar, usa el botón de enlace para suscribir el webhook.</span>
            </div>
            <div class="field">
              <label class="label">Facebook Page ID (opcional)</label>
              <input class="input" [(ngModel)]="igAccForm()!.pageId" placeholder="Solo si usas el flujo clásico ligado a una Página" />
            </div>
          </div>

          <div class="section-footer" style="justify-content: space-between;">
            <button class="btn btn-ghost" (click)="igAccForm.set(null)">Cancelar</button>
            <button class="btn btn-primary" [disabled]="savingIgAcc()" (click)="saveIgAccount()">
              <lucide-icon [img]="Save" [size]="16"></lucide-icon>
              {{ savingIgAcc() ? 'Guardando…' : 'Guardar cuenta' }}
            </button>
          </div>
        }
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
              <input class="input" [type]="showAiKey()['openai'] ? 'text' : 'password'" [(ngModel)]="aiKeys.openaiApiKey" placeholder="sk-..." />
              <button class="eye-btn" (click)="toggleAiKey('openai')" type="button">
                <lucide-icon [img]="showAiKey()['openai'] ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">platform.openai.com/api-keys</span>
          </div>
          <div class="field">
            <label class="label">DeepSeek API Key</label>
            <div class="input-wrap">
              <input class="input" [type]="showAiKey()['deepseek'] ? 'text' : 'password'" [(ngModel)]="aiKeys.deepseekApiKey" placeholder="sk-..." />
              <button class="eye-btn" (click)="toggleAiKey('deepseek')" type="button">
                <lucide-icon [img]="showAiKey()['deepseek'] ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">platform.deepseek.com</span>
          </div>
          <div class="field">
            <label class="label">Gemini API Key (Google)</label>
            <div class="input-wrap">
              <input class="input" [type]="showAiKey()['gemini'] ? 'text' : 'password'" [(ngModel)]="aiKeys.geminiApiKey" placeholder="AIza..." />
              <button class="eye-btn" (click)="toggleAiKey('gemini')" type="button">
                <lucide-icon [img]="showAiKey()['gemini'] ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">aistudio.google.com/apikey</span>
          </div>
          <div class="field">
            <label class="label">Claude API Key (Anthropic)</label>
            <div class="input-wrap">
              <input class="input" [type]="showAiKey()['claude'] ? 'text' : 'password'" [(ngModel)]="aiKeys.claudeApiKey" placeholder="sk-ant-..." />
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

      <!-- Templates Card (default account is Cloud API) -->
      @if (defaultProvider() === 'cloudapi') {
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
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; max-width: 900px; }
    .page-header { margin-bottom: 32px; }
    .page-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; color: var(--color-text-main); margin: 0 0 4px; }
    .page-subtitle { font-size: 14px; color: var(--color-text-muted); margin: 0; }

    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); background: #F0FDF4; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc { font-size: 13px; color: var(--color-text-muted); margin: 0; }

    .fields-grid { display: flex; flex-direction: column; gap: 20px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .field-hint { font-size: 12px; color: var(--color-text-muted); }

    .input-wrap { position: relative; display: flex; }
    .input-wrap .input { padding-right: 44px; flex: 1; }
    .eye-btn { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--color-text-muted); display: flex; align-items: center; }
    .eye-btn:hover { color: var(--color-text-main); }

    .loading-row { display: flex; align-items: center; gap: 10px; color: var(--color-text-muted); font-size: 14px; padding: 12px 0; }
    .empty-accounts { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 32px; color: var(--color-text-muted); font-size: 14px; }

    /* Account cards */
    .acc-list { display: flex; flex-direction: column; gap: 14px; }
    .acc-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 18px 20px; }
    .acc-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .acc-id { display: flex; flex-direction: column; gap: 3px; }
    .account-label { font-weight: 700; font-size: 15px; color: var(--color-text-main); }
    .account-sub { font-size: 12px; color: var(--color-text-muted); }
    .badge-default { display: inline-flex; align-items: center; gap: 4px; width: fit-content; background: #FEF9C3; color: #854D0E; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: var(--radius-pill); }
    .acc-card-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .acc-status { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 12px; font-weight: 600; color: var(--color-error); }
    .acc-status.ok { color: #16A34A; }

    .acc-panel { margin-top: 14px; padding: 16px; background: var(--color-bg-app); border-radius: var(--radius-lg); }
    .panel-hint { font-size: 12px; color: var(--color-text-muted); margin: 0 0 12px; }
    .test-row { display: flex; align-items: center; gap: 8px; }
    .qr-placeholder { width: 220px; height: 220px; border: 2px dashed var(--color-border); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; }
    .qr-image { width: 220px; height: 220px; border-radius: var(--radius-lg); border: 4px solid var(--color-white); box-shadow: var(--shadow-lg); }

    .webhook-hint { margin-top: 14px; font-size: 11px; color: var(--color-text-muted); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .webhook-hint code { background: var(--color-bg-app); padding: 3px 8px; border-radius: 6px; font-size: 11px; word-break: break-all; }

    .error-box { padding: 12px 16px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: var(--radius-lg); font-size: 13px; color: var(--color-error); }
    .success-box { display: flex; align-items: center; gap: 10px; padding: 14px 18px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: var(--radius-lg); font-size: 14px; color: #15803D; }

    .section-footer { display: flex; align-items: center; justify-content: flex-end; margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--color-border); }

    /* Templates list */
    .templates-list { display: flex; flex-direction: column; gap: 0; }
    .tpl-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--color-border); }
    .tpl-row:last-child { border-bottom: none; }
    .tpl-row-main { flex: 1; min-width: 0; }
    .tpl-name { font-weight: 700; font-size: 13px; color: var(--color-text-main); font-family: monospace; }
    .tpl-body { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tpl-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .tpl-badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-pill); background: var(--color-bg-app); color: var(--color-text-muted); border: 1px solid var(--color-border); }
    .tpl-status-approved { background: #F0FDF4; color: #15803D; border-color: #BBF7D0; }
    .tpl-status-pending  { background: #FEFCE8; color: #854D0E; border-color: #FEF08A; }
    .tpl-status-rejected { background: #FEF2F2; color: #DC2626; border-color: #FECACA; }
    .tpl-del-btn { color: var(--color-text-muted) !important; flex-shrink: 0; }
    .tpl-del-btn:hover { color: var(--color-error) !important; background: #FEF2F2 !important; }

    /* Modal */
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal-card { background: var(--color-white); border-radius: var(--radius-lg); width: calc(100% - 48px); max-width: 520px; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; max-height: 90vh; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
    .modal-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0; }
    .modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px; }
    .modal-footer { padding: 16px 24px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0; }

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
  readonly WifiOff = WifiOff;
  readonly QrCode = QrCode;
  readonly Eye = Eye;
  readonly EyeOff = EyeOff;
  readonly Plus = Plus;
  readonly Trash2 = Trash2;
  readonly X = X;
  readonly Layout = Layout;
  readonly Sparkles = Sparkles;
  readonly Smartphone = Smartphone;
  readonly Pencil = Pencil;
  readonly Star = Star;
  readonly Webhook = Webhook;
  readonly Instagram = Instagram;
  readonly Link = Link;

  // Accounts
  accounts = signal<WaAccount[]>([]);
  accountsLoading = signal(false);
  accForm = signal<WaAccount | null>(null);
  savingAcc = signal(false);
  connectingWa = signal(false);
  statusMap = signal<Record<string, WaStatus>>({});

  private fbSdkPromise: Promise<void> | null = null;
  private waSignupData: { wabaId: string; phoneNumberId: string } | null = null;
  private waMessageListener = (event: MessageEvent) => {
    if (!event.origin.endsWith('facebook.com')) return;
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'WA_EMBEDDED_SIGNUP' && data.event === 'FINISH') {
        this.waSignupData = { wabaId: data.data.waba_id, phoneNumberId: data.data.phone_number_id };
      }
    } catch { /* mensajes no relacionados al Embedded Signup */ }
  };

  // Instagram accounts
  igAccounts = signal<IgAccount[]>([]);
  igAccountsLoading = signal(false);
  igAccForm = signal<IgAccount | null>(null);
  savingIgAcc = signal(false);
  connectingIg = signal(false);
  showIgToken = signal(false);
  igStatusMap = signal<Record<string, { connected: boolean; username?: string; error?: string }>>({});
  qrMap = signal<Record<string, string>>({});
  qrActiveId = signal('');
  qrLoading = signal(false);
  qrError = signal('');
  testActiveId = signal('');
  testPhone = '';
  testLoading = signal(false);
  testResult = signal<{ success: boolean; formattedPhone?: string; error?: string } | null>(null);
  showKey = signal(false);
  showToken = signal(false);
  webhookLoading = signal('');

  defaultProvider = computed(() => this.accounts().find(a => a.isDefault)?.provider ?? '');

  // Daily limit + AI keys
  dailyLimit = 50;
  aiKeys: AiKeys = { openaiApiKey: '', deepseekApiKey: '', geminiApiKey: '', claudeApiKey: '' };
  showAiKey = signal<Record<string, boolean>>({});
  savingAi = signal(false);
  toggleAiKey(k: string) { this.showAiKey.update(m => ({ ...m, [k]: !m[k] })); }

  // Templates
  templates = signal<WaTemplate[]>([]);
  templatesLoading = signal(false);
  syncingTemplates = signal(false);
  templateModalOpen = signal(false);
  savingTemplate = signal(false);
  tplError = signal('');
  tplForm = { name: '', category: 'MARKETING' as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION', language: 'es', body: '', headerText: '', footer: '' };

  private statusInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.loadConfig();
    this.loadAccounts();
    this.loadIgAccounts();
    this.handleIgOAuthReturn();
    window.addEventListener('message', this.waMessageListener);
  }

  ngOnDestroy() {
    this.stopPolling();
    window.removeEventListener('message', this.waMessageListener);
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.templateModalOpen()) { this.closeTemplateModal(); return; }
    if (this.accForm()) { this.accForm.set(null); return; }
    if (this.igAccForm()) this.igAccForm.set(null);
  }

  /** Procesa el redirect de vuelta desde el callback OAuth de Instagram (ver instagram-oauth-callback.controller.ts). */
  private handleIgOAuthReturn() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('ig_oauth');
    if (!result) return;
    if (result === 'success') {
      this.toast.success('Cuenta de Instagram conectada');
      this.loadIgAccounts();
    } else {
      this.toast.error(params.get('reason') || 'No se pudo conectar la cuenta de Instagram');
    }
    params.delete('ig_oauth');
    params.delete('reason');
    const query = params.toString();
    history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  }

  // ---- Config (AI keys + daily limit) ----
  loadConfig() {
    this.http.get<AiKeys>(`${API}/settings`).subscribe({
      next: (cfg) => {
        if (!cfg) return;
        this.dailyLimit = cfg.waDailyLimit ?? 50;
        this.aiKeys = {
          openaiApiKey: cfg.openaiApiKey ?? '',
          deepseekApiKey: cfg.deepseekApiKey ?? '',
          geminiApiKey: cfg.geminiApiKey ?? '',
          claudeApiKey: cfg.claudeApiKey ?? '',
        };
      },
      error: () => {},
    });
  }

  saveDailyLimit() {
    this.http.put(`${API}/settings`, { waDailyLimit: Number(this.dailyLimit) || 50 }).subscribe({
      next: () => this.toast.success('Límite diario guardado'),
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al guardar'),
    });
  }

  saveAi() {
    this.savingAi.set(true);
    this.http.put(`${API}/settings`, { ...this.aiKeys }).subscribe({
      next: () => { this.toast.success('API keys de IA guardadas'); this.savingAi.set(false); },
      error: (err: { error?: { message?: string } }) => { this.toast.error(err.error?.message || 'Error al guardar'); this.savingAi.set(false); },
    });
  }

  // ---- Accounts ----
  loadAccounts() {
    this.accountsLoading.set(true);
    this.http.get<WaAccount[]>(`${API}/whatsapp-accounts`).subscribe({
      next: (a) => { this.accounts.set(a); this.accountsLoading.set(false); if (this.defaultProvider() === 'cloudapi') this.loadTemplates(); },
      error: () => this.accountsLoading.set(false),
    });
  }

  newAccount() { this.accForm.set(blankAccount()); this.showKey.set(false); this.showToken.set(false); }
  editAccount(a: WaAccount) { this.accForm.set({ ...a }); this.showKey.set(false); this.showToken.set(false); }

  webhookUrl(a: WaAccount): string {
    const kind = a.provider === 'waha' ? 'waha' : 'cloud';
    return `${API}/wa/webhook/${kind}/${a._id}`;
  }

  saveAccount() {
    const acc = this.accForm();
    if (!acc) return;
    if (!acc.label.trim()) { this.toast.error('El nombre es obligatorio'); return; }
    this.savingAcc.set(true);
    const { _id, ...body } = acc;
    const req = _id
      ? this.http.patch<WaAccount>(`${API}/whatsapp-accounts/${_id}`, body)
      : this.http.post<WaAccount>(`${API}/whatsapp-accounts`, body);
    req.subscribe({
      next: () => { this.toast.success('Cuenta guardada'); this.savingAcc.set(false); this.accForm.set(null); this.loadAccounts(); },
      error: (err: { error?: { message?: string } }) => { this.toast.error(err.error?.message || 'Error al guardar'); this.savingAcc.set(false); },
    });
  }

  async deleteAccount(a: WaAccount) {
    const ok = await this.confirm.confirm({ title: 'Eliminar cuenta', message: `¿Eliminar la cuenta "${a.label}"?`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.http.delete(`${API}/whatsapp-accounts/${a._id}`).subscribe({
      next: () => { this.toast.success('Cuenta eliminada'); this.loadAccounts(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }

  setDefault(a: WaAccount) {
    this.http.patch(`${API}/whatsapp-accounts/${a._id}/default`, {}).subscribe({
      next: () => { this.toast.success(`"${a.label}" es ahora la cuenta predeterminada`); this.loadAccounts(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error'),
    });
  }

  configureWebhook(a: WaAccount) {
    this.webhookLoading.set(a._id);
    this.http.post<{ success: boolean; message: string }>(`${API}/whatsapp-accounts/${a._id}/webhook`, {}).subscribe({
      next: (r) => {
        this.webhookLoading.set('');
        if (r.success) this.toast.success(r.message);
        else this.toast.error(r.message);
      },
      error: (err: { error?: { message?: string } }) => { this.webhookLoading.set(''); this.toast.error(err.error?.message || 'Error al configurar webhook'); },
    });
  }

  checkStatus(a: WaAccount) {
    this.http.get<WaStatus>(`${API}/whatsapp-accounts/${a._id}/status`).subscribe({
      next: (s) => this.statusMap.update(m => ({ ...m, [a._id]: s })),
      error: (err: { error?: { message?: string } }) => this.statusMap.update(m => ({ ...m, [a._id]: { connected: false, error: err.error?.message || 'Error' } })),
    });
  }

  toggleQr(a: WaAccount) {
    if (this.qrActiveId() === a._id) { this.qrActiveId.set(''); this.stopPolling(); return; }
    this.testActiveId.set('');
    this.qrActiveId.set(a._id);
    this.loadQr(a);
    this.startPolling(a);
  }

  loadQr(a: WaAccount) {
    this.qrLoading.set(true);
    this.qrError.set('');
    this.http.get<{ qrcode?: string; error?: string }>(`${API}/whatsapp-accounts/${a._id}/qr`).subscribe({
      next: (r) => {
        this.qrLoading.set(false);
        if (r.qrcode) {
          const src = r.qrcode.startsWith('data:') ? r.qrcode : `data:image/png;base64,${r.qrcode}`;
          this.qrMap.update(m => ({ ...m, [a._id]: src }));
        } else {
          this.qrError.set(r.error ?? 'No se pudo obtener el QR');
        }
      },
      error: () => { this.qrLoading.set(false); this.qrError.set('Error al conectar con WAHA'); },
    });
  }

  toggleTest(a: WaAccount) {
    if (this.testActiveId() === a._id) { this.testActiveId.set(''); return; }
    this.qrActiveId.set('');
    this.stopPolling();
    this.testActiveId.set(a._id);
    this.testResult.set(null);
  }

  testAccount(a: WaAccount) {
    if (!this.testPhone.trim()) { this.toast.error('Ingresa un número'); return; }
    this.testLoading.set(true);
    this.testResult.set(null);
    this.http.post<{ success: boolean; formattedPhone?: string; error?: string }>(`${API}/whatsapp-accounts/${a._id}/test`, { phone: this.testPhone }).subscribe({
      next: (r) => { this.testResult.set(r); this.testLoading.set(false); },
      error: (err: { error?: { message?: string } }) => { this.testResult.set({ success: false, formattedPhone: this.testPhone, error: err.error?.message || 'Error de red' }); this.testLoading.set(false); },
    });
  }

  private startPolling(a: WaAccount) {
    this.stopPolling();
    this.statusInterval = setInterval(() => {
      this.checkStatus(a);
      if (this.statusMap()[a._id]?.connected) { this.stopPolling(); return; }
      if (this.qrActiveId() === a._id) this.loadQr(a);
    }, 10000);
  }

  private stopPolling() {
    if (this.statusInterval) { clearInterval(this.statusInterval); this.statusInterval = null; }
  }

  renewWaToken(a: WaAccount) {
    this.http.post<{ success: boolean; tokenExpiresAt: string }>(`${API}/whatsapp-accounts/${a._id}/oauth/refresh`, {}).subscribe({
      next: () => { this.toast.success('Token renovado'); this.loadAccounts(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo renovar el token'),
    });
  }

  /** Carga el SDK de JavaScript de Facebook una sola vez (memoizado). */
  private loadFacebookSdk(appId: string): Promise<void> {
    if (this.fbSdkPromise) return this.fbSdkPromise;
    this.fbSdkPromise = new Promise((resolve) => {
      const w = window as any;
      if (w.FB) { w.FB.init({ appId, xfbml: true, version: 'v21.0' }); resolve(); return; }
      w.fbAsyncInit = () => { w.FB.init({ appId, xfbml: true, version: 'v21.0' }); resolve(); };
      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    });
    return this.fbSdkPromise;
  }

  connectWhatsApp() {
    this.connectingWa.set(true);
    this.waSignupData = null;
    this.http.get<{ appId?: string; configId?: string }>(`${API}/whatsapp-accounts/oauth/config`).subscribe({
      next: async (cfg) => {
        if (!cfg.appId || !cfg.configId) {
          this.toast.error('La conexión con WhatsApp no está configurada en el servidor');
          this.connectingWa.set(false);
          return;
        }
        await this.loadFacebookSdk(cfg.appId);
        FB.login((response: any) => {
          if (response?.authResponse?.code) {
            this.finishWaConnect(response.authResponse.code);
          } else {
            this.connectingWa.set(false);
          }
        }, {
          config_id: cfg.configId,
          response_type: 'code',
          override_default_response_type: true,
        });
      },
      error: (err: { error?: { message?: string } }) => {
        this.toast.error(err.error?.message || 'No se pudo iniciar la conexión con WhatsApp');
        this.connectingWa.set(false);
      },
    });
  }

  /** El postMessage con waba_id/phone_number_id puede llegar unos ms después del callback de FB.login. */
  private finishWaConnect(code: string, attempt = 0) {
    if (!this.waSignupData && attempt < 20) {
      setTimeout(() => this.finishWaConnect(code, attempt + 1), 100);
      return;
    }
    if (!this.waSignupData) {
      this.toast.error('No se recibió la información de la cuenta de WhatsApp. Intenta de nuevo.');
      this.connectingWa.set(false);
      return;
    }
    this.http.post<WaAccount>(`${API}/whatsapp-accounts/oauth/connect`, {
      code, wabaId: this.waSignupData.wabaId, phoneNumberId: this.waSignupData.phoneNumberId,
    }).subscribe({
      next: () => {
        this.toast.success('Cuenta de WhatsApp conectada');
        this.connectingWa.set(false);
        this.loadAccounts();
      },
      error: (err: { error?: { message?: string } }) => {
        this.toast.error(err.error?.message || 'No se pudo conectar la cuenta de WhatsApp');
        this.connectingWa.set(false);
      },
    });
  }

  // ---- Instagram Accounts ----
  loadIgAccounts() {
    this.igAccountsLoading.set(true);
    this.http.get<IgAccount[]>(`${API}/instagram-accounts`).subscribe({
      next: (a) => { this.igAccounts.set(a); this.igAccountsLoading.set(false); },
      error: () => this.igAccountsLoading.set(false),
    });
  }

  newIgAccount() { this.igAccForm.set(blankIgAccount()); this.showIgToken.set(false); }
  editIgAccount(a: IgAccount) { this.igAccForm.set({ ...a }); this.showIgToken.set(false); }

  igWebhookUrl(): string {
    return `${API}/ig/webhook`;
  }

  saveIgAccount() {
    const acc = this.igAccForm();
    if (!acc) return;
    if (!acc.label.trim()) { this.toast.error('El nombre es obligatorio'); return; }
    this.savingIgAcc.set(true);
    const { _id, ...body } = acc;
    const req = _id
      ? this.http.patch<IgAccount>(`${API}/instagram-accounts/${_id}`, body)
      : this.http.post<IgAccount>(`${API}/instagram-accounts`, body);
    req.subscribe({
      next: () => {
        this.toast.success('Cuenta guardada');
        this.savingIgAcc.set(false);
        this.igAccForm.set(null);
        this.loadIgAccounts();
      },
      error: (err: { error?: { message?: string } }) => { this.toast.error(err.error?.message || 'Error al guardar'); this.savingIgAcc.set(false); },
    });
  }

  async deleteIgAccount(a: IgAccount) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar cuenta', message: `¿Eliminar la cuenta de Instagram "${a.label}"?`,
      confirmText: 'Eliminar', danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/instagram-accounts/${a._id}`).subscribe({
      next: () => { this.toast.success('Cuenta eliminada'); this.loadIgAccounts(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }

  checkIgStatus(a: IgAccount) {
    this.http.get<{ connected: boolean; username?: string; error?: string }>(`${API}/instagram-accounts/${a._id}/status`).subscribe({
      next: (s) => this.igStatusMap.update(m => ({ ...m, [a._id]: s })),
      error: (err: { error?: { message?: string } }) => this.igStatusMap.update(m => ({ ...m, [a._id]: { connected: false, error: err.error?.message || 'Error' } })),
    });
  }

  connectInstagram() {
    this.connectingIg.set(true);
    this.http.get<{ url: string }>(`${API}/instagram-accounts/oauth/start`).subscribe({
      next: (r) => { window.location.href = r.url; },
      error: (err: { error?: { message?: string } }) => {
        this.toast.error(err.error?.message || 'No se pudo iniciar la conexión con Instagram');
        this.connectingIg.set(false);
      },
    });
  }

  renewIgToken(a: IgAccount) {
    this.http.post<{ success: boolean; tokenExpiresAt: string }>(`${API}/instagram-accounts/${a._id}/oauth/refresh`, {}).subscribe({
      next: () => { this.toast.success('Token renovado'); this.loadIgAccounts(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo renovar el token'),
    });
  }

  subscribeIgWebhook(a: IgAccount) {
    this.http.post<{ success: boolean; message: string }>(`${API}/instagram-accounts/${a._id}/subscribe`, {}).subscribe({
      next: (r) => r.success ? this.toast.success(r.message) : this.toast.error(r.message),
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo suscribir el webhook'),
    });
  }

  // ---- Templates ----
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
      next: (data) => { this.templates.set(data); this.syncingTemplates.set(false); this.toast.success(`${data.length} plantilla(s) sincronizadas desde Meta`); },
      error: (err: { error?: { message?: string } }) => { this.syncingTemplates.set(false); this.toast.error(err.error?.message || 'Error al sincronizar plantillas'); },
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
      next: (t) => { this.templates.update(list => [...list, t]); this.savingTemplate.set(false); this.closeTemplateModal(); this.toast.success('Plantilla creada. Pendiente de aprobación por Meta.'); },
      error: (err: { error?: { message?: string } }) => { this.tplError.set(err.error?.message || 'Error al crear plantilla'); this.savingTemplate.set(false); },
    });
  }

  async deleteTemplate(t: WaTemplate) {
    const ok = await this.confirm.confirm({ title: 'Eliminar plantilla', message: `¿Eliminar la plantilla "${t.name}"? Esta acción también la eliminará de Meta.`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.http.delete(`${API}/settings/templates/${t._id}`).subscribe({
      next: () => { this.templates.update(list => list.filter(x => x._id !== t._id)); this.toast.success('Plantilla eliminada'); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }
}
