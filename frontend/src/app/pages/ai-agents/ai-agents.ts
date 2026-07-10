import { Component, inject, signal, OnInit, HostListener, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import {
  LucideAngularModule, Bot, Plus, X, Trash2, Send, Upload, FileText, MessageSquare,
  Smartphone, Check, Sparkles, BookOpen, Phone, RefreshCw, Power, Pencil, FlaskConical,
  Paperclip, Copy, Instagram, Settings,
} from 'lucide-angular';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

interface WaAccount {
  _id: string;
  label: string;
  provider: 'waha' | 'cloudapi';
  phoneNumber?: string;
  active: boolean;
}

interface IgAccount {
  _id: string;
  label: string;
  username?: string;
  active: boolean;
}

interface Agent {
  _id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  provider: string;
  aiModel?: string;
  temperature: number;
  maxTokens: number;
  greeting?: string;
  fallbackMessage: string;
  ragEnabled: boolean;
  topK: number;
  accountIds: string[];
  instagramAccountIds: string[];
  published: boolean;
}

interface KDoc {
  _id: string;
  filename: string;
  status: 'processing' | 'ready' | 'error';
  chunkCount: number;
  charCount: number;
  error?: string;
}

interface AgentFile {
  _id: string;
  alias: string;
  name: string;
  filename: string;
  url: string;
  contentType?: string;
}

type Section = 'general' | 'channels' | 'knowledge' | 'files' | 'advanced';

function blankAgent(): Agent {
  return {
    _id: '', name: '', description: '', systemPrompt: 'Eres un asistente amable y servicial. Responde de forma clara y breve.',
    provider: 'auto', aiModel: '', temperature: 0.4, maxTokens: 800, greeting: '',
    fallbackMessage: 'Lo siento, no tengo esa información en este momento.',
    ragEnabled: true, topK: 5, accountIds: [], instagramAccountIds: [], published: false,
  };
}

@Component({
  selector: 'app-ai-agents',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, RouterLink],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Agentes IA</h1>
          <p class="page-sub">Crea asistentes que responden por WhatsApp e Instagram con tu conocimiento (RAG)</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" (click)="openNew()">
            <lucide-icon [img]="Plus" [size]="16" [strokeWidth]="2.5"></lucide-icon>
            Nuevo agente
          </button>
        </div>
      </div>

      @if (loading()) {
        <div class="grid">
          @for (i of [1,2,3]; track i) { <div class="skeleton-card"></div> }
        </div>
      } @else if (agents().length === 0) {
        <div class="empty-state card">
          <lucide-icon [img]="Bot" [size]="44" [strokeWidth]="1.5" style="color:var(--color-text-muted)"></lucide-icon>
          <p>Aún no tienes agentes. Crea el primero para empezar a responder automáticamente.</p>
          <button class="btn btn-primary" (click)="openNew()">
            <lucide-icon [img]="Plus" [size]="16" [strokeWidth]="2.5"></lucide-icon>
            Nuevo agente
          </button>
        </div>
      } @else {
        <div class="grid">
          @for (a of agents(); track a._id) {
            <div class="agent-card card">
              <div class="agent-card-top">
                <div class="agent-avatar"><lucide-icon [img]="Bot" [size]="22" [strokeWidth]="2"></lucide-icon></div>
                <span class="badge" [class.badge-success]="a.published" [class.badge-muted]="!a.published">
                  {{ a.published ? 'Publicado' : 'Borrador' }}
                </span>
              </div>
              <h3>{{ a.name }}</h3>
              <p class="agent-desc">{{ a.description || a.systemPrompt }}</p>
              <div class="agent-meta">
                @if (a.accountIds.length > 0) {
                  <span class="meta-pill"><lucide-icon [img]="Smartphone" [size]="13"></lucide-icon> {{ a.accountIds.length }} WhatsApp</span>
                }
                @if (a.instagramAccountIds.length > 0) {
                  <span class="meta-pill"><lucide-icon [img]="Instagram" [size]="13"></lucide-icon> {{ a.instagramAccountIds.length }} Instagram</span>
                }
                @if (a.accountIds.length === 0 && a.instagramAccountIds.length === 0) {
                  <span class="meta-pill">Sin canales</span>
                }
                @if (a.ragEnabled) {
                  <span class="meta-pill"><lucide-icon [img]="BookOpen" [size]="13"></lucide-icon> RAG</span>
                }
              </div>
              <div class="agent-card-actions">
                <button class="btn btn-sm btn-secondary" (click)="openPlayground(a)" title="Probar">
                  <lucide-icon [img]="FlaskConical" [size]="14" [strokeWidth]="2.5"></lucide-icon> Probar
                </button>
                <button class="btn btn-sm btn-secondary" (click)="openEdit(a)" title="Editar">
                  <lucide-icon [img]="Pencil" [size]="14" [strokeWidth]="2.5"></lucide-icon>
                </button>
                <button class="btn btn-sm btn-ghost btn-icon" (click)="remove(a)" title="Eliminar">
                  <lucide-icon [img]="Trash2" [size]="14" [strokeWidth]="2.5" style="color:var(--color-error)"></lucide-icon>
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>

    <!-- ───────── Editor Drawer ───────── -->
    @if (drawerOpen()) {
      <div class="overlay" (click)="closeDrawer()" role="dialog" aria-modal="true">
        <aside class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div class="drawer-title-group">
              <h2>{{ form._id ? 'Editar agente' : 'Nuevo agente' }}</h2>
              <p class="subtitle">Configura cómo piensa y responde tu asistente.</p>
            </div>
            <div class="header-right">
              <label class="publish-toggle">
                <input type="checkbox" [(ngModel)]="form.published" />
                <span><lucide-icon [img]="Power" [size]="14" [strokeWidth]="2.5"></lucide-icon> Publicado</span>
              </label>
              <button class="btn btn-ghost btn-icon" (click)="closeDrawer()" aria-label="Cerrar">
                <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
              </button>
            </div>
          </div>

          <div class="tabs">
            @for (t of sections; track t.key) {
              <button class="tab" [class.active]="section() === t.key" (click)="section.set(t.key)">
                <lucide-icon [img]="t.icon" [size]="15" [strokeWidth]="2.5"></lucide-icon> {{ t.label }}
              </button>
            }
          </div>

          <div class="drawer-scroll">
            <!-- GENERAL -->
            @if (section() === 'general') {
              <div class="field">
                <label class="field-label">Nombre *</label>
                <input class="input" [(ngModel)]="form.name" placeholder="Ej: Asistente de Reservas" />
              </div>
              <div class="field">
                <label class="field-label">Descripción</label>
                <input class="input" [(ngModel)]="form.description" placeholder="Breve descripción interna" />
              </div>
              <div class="field">
                <label class="field-label">Prompt del sistema *</label>
                <textarea class="textarea" #promptTextarea [(ngModel)]="form.systemPrompt" rows="7"
                  placeholder="Define la personalidad, el rol y las reglas del agente…"></textarea>
                <span class="field-hint">Instrucciones base que guían todas las respuestas del agente.</span>
                @if (agentFiles().length > 0) {
                  <div class="token-helper">
                    <span class="token-helper-label">
                      <lucide-icon [img]="Paperclip" [size]="13"></lucide-icon>
                      Insertar token de archivo:
                    </span>
                    <div class="token-chips">
                      @for (f of agentFiles(); track f._id) {
                        <button type="button" class="token-chip" (click)="insertToken(f.alias)" [title]="f.name">
                          {{ fileToken(f.alias) }}
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
              <div class="field">
                <label class="field-label">Mensaje de saludo (opcional)</label>
                <input class="input" [(ngModel)]="form.greeting" placeholder="¡Hola! ¿En qué puedo ayudarte?" />
              </div>
              <div class="field">
                <label class="field-label">Mensaje de respaldo</label>
                <input class="input" [(ngModel)]="form.fallbackMessage" placeholder="Cuando no encuentra respuesta" />
              </div>
            }

            <!-- CANALES -->
            @if (section() === 'channels') {
              <p class="field-hint" style="margin-bottom:16px">
                Las cuentas de WhatsApp e Instagram se conectan desde <strong>Configuración</strong> y quedan disponibles para todos los agentes (y para campañas). Acá solo elegís por cuáles responde este agente.
              </p>

              <p class="channel-group-title">
                <lucide-icon [img]="Smartphone" [size]="14"></lucide-icon> WhatsApp
              </p>
              @if (accounts().length === 0) {
                <div class="inline-empty">
                  <lucide-icon [img]="Smartphone" [size]="28" [strokeWidth]="1.5" style="color:var(--color-text-muted)"></lucide-icon>
                  <p>No hay cuentas de WhatsApp configuradas.</p>
                  <a class="btn btn-sm btn-secondary" routerLink="/settings">
                    <lucide-icon [img]="Settings" [size]="14"></lucide-icon> Ir a Configuración
                  </a>
                </div>
              } @else {
                <p class="field-hint" style="margin-bottom:12px">Selecciona por qué números responderá este agente.</p>
                @for (acc of accounts(); track acc._id) {
                  <label class="account-row" [class.selected]="form.accountIds.includes(acc._id)">
                    <input type="checkbox" [checked]="form.accountIds.includes(acc._id)" (change)="toggleAccount(acc._id)" />
                    <div class="account-info">
                      <span class="account-label">{{ acc.label }}</span>
                      <span class="account-sub">
                        {{ acc.provider === 'waha' ? 'WAHA' : 'Cloud API' }}{{ acc.phoneNumber ? ' · ' + acc.phoneNumber : '' }}
                      </span>
                    </div>
                    @if (!acc.active) { <span class="badge badge-muted">Inactiva</span> }
                  </label>
                }
                <a class="btn btn-sm btn-ghost" style="margin-top:8px" routerLink="/settings">
                  <lucide-icon [img]="Settings" [size]="14"></lucide-icon> Gestionar cuentas en Configuración
                </a>
              }

              <p class="channel-group-title" style="margin-top:24px">
                <lucide-icon [img]="Instagram" [size]="14"></lucide-icon> Instagram (DM)
              </p>
              @if (igAccounts().length === 0) {
                <div class="inline-empty">
                  <lucide-icon [img]="Instagram" [size]="28" [strokeWidth]="1.5" style="color:var(--color-text-muted)"></lucide-icon>
                  <p>No hay cuentas de Instagram configuradas.</p>
                  <a class="btn btn-sm btn-secondary" routerLink="/settings">
                    <lucide-icon [img]="Settings" [size]="14"></lucide-icon> Ir a Configuración
                  </a>
                </div>
              } @else {
                <p class="field-hint" style="margin-bottom:12px">Selecciona por qué cuentas de Instagram responderá este agente.</p>
                @for (acc of igAccounts(); track acc._id) {
                  <label class="account-row" [class.selected]="form.instagramAccountIds.includes(acc._id)">
                    <input type="checkbox" [checked]="form.instagramAccountIds.includes(acc._id)" (change)="toggleIgAccount(acc._id)" />
                    <div class="account-info">
                      <span class="account-label">{{ acc.label }}</span>
                      <span class="account-sub">{{ acc.username ? '@' + acc.username : 'Instagram Messaging' }}</span>
                    </div>
                    @if (!acc.active) { <span class="badge badge-muted">Inactiva</span> }
                  </label>
                }
                <a class="btn btn-sm btn-ghost" style="margin-top:8px" routerLink="/settings">
                  <lucide-icon [img]="Settings" [size]="14"></lucide-icon> Gestionar cuentas en Configuración
                </a>
              }
            }

            <!-- CONOCIMIENTO -->
            @if (section() === 'knowledge') {
              <div class="field" style="flex-direction:row;align-items:center;justify-content:space-between">
                <div>
                  <label class="field-label" style="margin:0">Base de conocimiento (RAG)</label>
                  <span class="field-hint">El agente buscará en estos documentos antes de responder.</span>
                </div>
                <label class="switch">
                  <input type="checkbox" [(ngModel)]="form.ragEnabled" />
                  <span class="slider"></span>
                </label>
              </div>

              @if (!form._id) {
                <div class="inline-empty">
                  <lucide-icon [img]="BookOpen" [size]="28" [strokeWidth]="1.5" style="color:var(--color-text-muted)"></lucide-icon>
                  <p>Guarda el agente primero para subir documentos.</p>
                </div>
              } @else {
                <label class="upload-zone" [class.uploading]="uploading()">
                  <input type="file" accept=".pdf,.txt,.md,.csv,.json" (change)="onFile($event)" style="display:none" [disabled]="uploading()" />
                  <lucide-icon [img]="Upload" [size]="22" [strokeWidth]="1.5" style="color:var(--color-text-muted)"></lucide-icon>
                  <span class="upload-label">{{ uploading() ? 'Subiendo…' : 'Subir documento' }}</span>
                  <span class="upload-hint">PDF, TXT, MD, CSV o JSON · hasta 20 MB</span>
                </label>

                @if (docs().length > 0) {
                  <div class="doc-list">
                    @for (d of docs(); track d._id) {
                      <div class="doc-row">
                        <lucide-icon [img]="FileText" [size]="18" [strokeWidth]="2" style="color:var(--color-brand)"></lucide-icon>
                        <div class="doc-info">
                          <span class="doc-name">{{ d.filename }}</span>
                          <span class="doc-meta">
                            @if (d.status === 'ready') { {{ d.chunkCount }} fragmentos · {{ kchars(d.charCount) }}k caracteres }
                            @else if (d.status === 'processing') { <span class="proc">Procesando…</span> }
                            @else { <span class="err">Error: {{ d.error }}</span> }
                          </span>
                        </div>
                        <button class="btn btn-icon btn-ghost btn-sm" (click)="deleteDoc(d)" title="Eliminar">
                          <lucide-icon [img]="Trash2" [size]="14" style="color:var(--color-error)"></lucide-icon>
                        </button>
                      </div>
                    }
                  </div>
                  <button class="btn btn-sm btn-ghost" (click)="loadDocs(form._id)">
                    <lucide-icon [img]="RefreshCw" [size]="13"></lucide-icon> Actualizar estado
                  </button>
                }
              }
            }

            <!-- ARCHIVOS -->
            @if (section() === 'files') {
              <p class="field-hint" style="margin-bottom:16px">
                Sube archivos que el agente podrá enviar por WhatsApp cuando sea relevante.
                En el prompt usa <code>{{ exampleToken }}</code> para indicar cuándo enviarlos.
              </p>

              @if (!form._id) {
                <div class="inline-empty">
                  <lucide-icon [img]="Paperclip" [size]="28" [strokeWidth]="1.5" style="color:var(--color-text-muted)"></lucide-icon>
                  <p>Guarda el agente primero para subir archivos.</p>
                </div>
              } @else {
                <div class="file-upload-form">
                  <div class="field-row">
                    <div class="field">
                      <label class="field-label">Alias * <span class="field-hint" style="display:inline">(sin espacios)</span></label>
                      <input class="input" [(ngModel)]="newFileAlias" (ngModelChange)="sanitizeAlias()"
                        placeholder="ej: menu, horarios, carta" />
                    </div>
                    <div class="field">
                      <label class="field-label">Nombre descriptivo *</label>
                      <input class="input" [(ngModel)]="newFileName" placeholder="ej: Carta del restaurante" />
                    </div>
                  </div>
                  <label class="upload-zone" [class.uploading]="uploadingFile()">
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.mp4,.webp,image/*,video/*" (change)="onAgentFile($event)" style="display:none" [disabled]="uploadingFile()" />
                    <lucide-icon [img]="Paperclip" [size]="22" [strokeWidth]="1.5" style="color:var(--color-text-muted)"></lucide-icon>
                    <span class="upload-label">{{ uploadingFile() ? 'Subiendo…' : 'Seleccionar archivo' }}</span>
                    <span class="upload-hint">PDF, imágenes, videos · hasta 20 MB</span>
                  </label>
                </div>

                @if (agentFiles().length > 0) {
                  <div class="doc-list" style="margin-top:16px">
                    @for (f of agentFiles(); track f._id) {
                      <div class="doc-row">
                        <lucide-icon [img]="Paperclip" [size]="18" [strokeWidth]="2" style="color:var(--color-brand)"></lucide-icon>
                        <div class="doc-info">
                          <span class="doc-name">{{ f.name }}</span>
                          <span class="doc-meta">
                            <code class="alias-code">{{ fileToken(f.alias) }}</code>
                            · {{ f.filename }}
                          </span>
                        </div>
                        <button class="btn btn-icon btn-ghost btn-sm" (click)="copyToken(f.alias)" title="Copiar token">
                          <lucide-icon [img]="Copy" [size]="13" style="color:var(--color-text-muted)"></lucide-icon>
                        </button>
                        <button class="btn btn-icon btn-ghost btn-sm" (click)="deleteAgentFile(f)" title="Eliminar">
                          <lucide-icon [img]="Trash2" [size]="14" style="color:var(--color-error)"></lucide-icon>
                        </button>
                      </div>
                    }
                  </div>
                }
              }
            }

            <!-- AVANZADO -->
            @if (section() === 'advanced') {
              <div class="field">
                <label class="field-label">Proveedor de IA</label>
                <select class="select" [(ngModel)]="form.provider">
                  <option value="auto">Automático</option>
                  <option value="openai">OpenAI</option>
                  <option value="claude">Claude (Anthropic)</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="gemini">Gemini (Google)</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label">Modelo (opcional)</label>
                <input class="input" [(ngModel)]="form.aiModel" placeholder="Dejar vacío para el predeterminado" />
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="field-label">Temperatura: {{ form.temperature }}</label>
                  <input type="range" min="0" max="1" step="0.1" [(ngModel)]="form.temperature" />
                </div>
                <div class="field">
                  <label class="field-label">Máx. tokens</label>
                  <input class="input" type="number" [(ngModel)]="form.maxTokens" min="100" max="4000" />
                </div>
              </div>
              <div class="field">
                <label class="field-label">Fragmentos a recuperar (topK)</label>
                <input class="input" type="number" [(ngModel)]="form.topK" min="1" max="15" />
              </div>
            }

            <div class="drawer-actions">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()">Cerrar</button>
              <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">
                {{ saving() ? 'Guardando…' : (form._id ? 'Guardar cambios' : 'Crear agente') }}
              </button>
            </div>
          </div>
        </aside>
      </div>
    }

    <!-- ───────── Playground Drawer ───────── -->
    @if (playgroundAgent()) {
      <div class="overlay" (click)="closePlayground()" role="dialog" aria-modal="true">
        <aside class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div class="drawer-title-group">
              <h2><lucide-icon [img]="FlaskConical" [size]="20" [strokeWidth]="2.5"></lucide-icon> Probar: {{ playgroundAgent()!.name }}</h2>
              <p class="subtitle">Conversa con el agente antes de publicarlo.</p>
            </div>
            <div class="header-right">
              <button class="btn btn-ghost btn-sm" (click)="resetChat()">Reiniciar</button>
              <button class="btn btn-ghost btn-icon" (click)="closePlayground()" aria-label="Cerrar">
                <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
              </button>
            </div>
          </div>

          <div class="chat-scroll">
            @if (chat().length === 0) {
              <div class="chat-empty">
                <lucide-icon [img]="Sparkles" [size]="28" [strokeWidth]="1.5" style="color:var(--color-brand)"></lucide-icon>
                <p>{{ playgroundAgent()!.greeting || 'Escribe un mensaje para empezar a probar el agente.' }}</p>
              </div>
            }
            @for (m of chat(); track $index) {
              <div class="bubble" [class.user]="m.role === 'user'" [class.assistant]="m.role === 'assistant'">
                {{ m.content }}
              </div>
            }
            @if (sending()) {
              <div class="bubble assistant typing">Escribiendo…</div>
            }
          </div>

          <div class="chat-input">
            <textarea class="input" [(ngModel)]="chatInput" rows="1" placeholder="Escribe un mensaje…"
              (keydown.enter)="$event.preventDefault(); sendChat()"></textarea>
            <button class="btn btn-primary btn-icon" [disabled]="sending() || !chatInput.trim()" (click)="sendChat()">
              <lucide-icon [img]="Send" [size]="18" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>
        </aside>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 28px; }
    .page-header h1 { font-family: var(--font-heading); font-size: 28px; font-weight: 700; margin: 0; }
    .page-sub { color: var(--color-text-muted); font-size: 14px; margin: 4px 0 0; }
    .header-actions { display: flex; gap: 10px; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
    .skeleton-card { height: 200px; border-radius: var(--radius-lg); background: linear-gradient(90deg, var(--color-bg-app) 25%, var(--color-border) 50%, var(--color-bg-app) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .agent-card { padding: 24px; display: flex; flex-direction: column; gap: 10px; }
    .agent-card-top { display: flex; align-items: center; justify-content: space-between; }
    .agent-avatar { width: 44px; height: 44px; border-radius: 14px; background: var(--color-brand-light); color: var(--color-brand); display: flex; align-items: center; justify-content: center; }
    .agent-card h3 { margin: 4px 0 0; font-size: 17px; font-weight: 700; }
    .agent-desc { color: var(--color-text-muted); font-size: 13px; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 36px; }
    .agent-meta { display: flex; gap: 8px; flex-wrap: wrap; }
    .meta-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--color-text-muted); background: var(--color-bg-app); padding: 3px 10px; border-radius: var(--radius-pill); }
    .agent-card-actions { display: flex; gap: 8px; margin-top: 6px; }
    .agent-card-actions .btn:first-child { flex: 1; }

    .badge-success { background: #DCFCE7; color: #16A34A; }
    .badge-muted { background: var(--color-bg-app); color: var(--color-text-muted); }

    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 64px 24px; text-align: center; color: var(--color-text-muted); }

    /* Overlay + Drawer */
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: stretch; justify-content: flex-end; z-index: 100; }
    .drawer { width: 600px; max-width: 100%; background: #fff; box-shadow: -10px 0 40px rgba(0,0,0,.15); display: flex; flex-direction: column; height: 100vh; animation: slideInRight .25s var(--transition-spring); }
    @keyframes slideInRight { from { transform: translateX(40px); opacity: .6; } to { transform: translateX(0); opacity: 1; } }
    .drawer-header { padding: 28px 32px 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
    .drawer-title-group h2 { margin: 0 0 4px; font-size: 22px; font-weight: 800; letter-spacing: -.5px; display: flex; align-items: center; gap: 8px; }
    .subtitle { color: var(--color-text-muted); font-size: 13px; margin: 0; }
    .header-right { display: flex; align-items: center; gap: 10px; }
    .publish-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .publish-toggle span { display: inline-flex; align-items: center; gap: 5px; }

    .tabs { display: flex; gap: 4px; padding: 12px 32px 0; border-bottom: 1px solid var(--color-border); flex-shrink: 0; overflow-x: auto; }
    .tab { display: inline-flex; align-items: center; gap: 6px; padding: 10px 14px; border: none; background: none; color: var(--color-text-muted); font-size: 13px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
    .tab.active { color: var(--color-brand); border-bottom-color: var(--color-brand); }

    .drawer-scroll { padding: 24px 32px; overflow-y: auto; flex: 1; }
    .drawer-actions { display: flex; gap: 12px; justify-content: flex-end; padding-top: 20px; border-top: 1px solid var(--color-border); margin-top: 16px; }

    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
    .field-row { display: flex; gap: 16px; }
    .field-row .field { flex: 1; }
    .field-label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .field-hint { font-size: 12px; color: var(--color-text-muted); }
    .textarea { resize: vertical; min-height: 90px; }

    /* Token helper */
    .token-helper { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; padding: 10px 14px; background: var(--color-bg-app); border-radius: var(--radius-lg); border: 1px solid var(--color-border); }
    .token-helper-label { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: var(--color-text-muted); }
    .token-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .token-chip { display: inline-flex; align-items: center; padding: 4px 10px; background: var(--color-brand-light); color: var(--color-brand); border: 1px solid var(--color-brand); border-radius: var(--radius-pill); font-size: 11px; font-family: monospace; font-weight: 600; cursor: pointer; transition: all var(--transition-fast); }
    .token-chip:hover { background: var(--color-brand); color: #fff; }

    /* Files tab */
    .file-upload-form { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 16px; background: var(--color-bg-app); margin-bottom: 4px; }
    .alias-code { font-family: monospace; font-size: 11px; background: var(--color-brand-light); color: var(--color-brand); padding: 2px 6px; border-radius: 4px; }

    .inline-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px; text-align: center; color: var(--color-text-muted); font-size: 13px; }

    .channel-group-title { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--color-text-muted); margin: 0 0 12px; }
    .account-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1.5px solid var(--color-border); border-radius: var(--radius-lg); margin-bottom: 10px; cursor: pointer; transition: all var(--transition-fast); }
    .account-row.selected { border-color: var(--color-brand); background: var(--color-brand-light); }
    .account-info { display: flex; flex-direction: column; flex: 1; }
    .account-label { font-weight: 600; font-size: 14px; }
    .account-sub { font-size: 12px; color: var(--color-text-muted); }

    .switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; inset: 0; background: var(--color-border); border-radius: 24px; transition: .2s; cursor: pointer; }
    .slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; }
    .switch input:checked + .slider { background: var(--color-brand); }
    .switch input:checked + .slider::before { transform: translateX(20px); }

    .upload-zone { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 24px; border: 2px dashed var(--color-border); border-radius: var(--radius-lg); background: #fff; cursor: pointer; transition: border-color var(--transition-fast); margin-bottom: 16px; }
    .upload-zone:hover { border-color: var(--color-brand); }
    .upload-zone.uploading { opacity: .6; pointer-events: none; }
    .upload-label { font-size: 14px; font-weight: 600; }
    .upload-hint { font-size: 11px; color: var(--color-text-muted); }

    .doc-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
    .doc-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: #fff; }
    .doc-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .doc-name { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .doc-meta { font-size: 12px; color: var(--color-text-muted); }
    .doc-meta .proc { color: var(--color-brand); }
    .doc-meta .err { color: var(--color-error); }

    /* Chat playground */
    .chat-scroll { flex: 1; overflow-y: auto; padding: 24px 32px; display: flex; flex-direction: column; gap: 12px; background: var(--color-bg-app); }
    .chat-empty { margin: auto; text-align: center; color: var(--color-text-muted); display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 280px; }
    .bubble { max-width: 80%; padding: 12px 16px; border-radius: 18px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
    .bubble.user { align-self: flex-end; background: var(--color-brand); color: #fff; border-bottom-right-radius: 6px; }
    .bubble.assistant { align-self: flex-start; background: #fff; color: var(--color-text-main); border: 1px solid var(--color-border); border-bottom-left-radius: 6px; }
    .bubble.typing { opacity: .6; font-style: italic; }
    .chat-input { display: flex; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--color-border); flex-shrink: 0; align-items: flex-end; }
    .chat-input .input { flex: 1; resize: none; max-height: 120px; }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .grid { grid-template-columns: 1fr; }
      .drawer-header { padding: 20px 18px 14px; flex-wrap: wrap; }
      .header-right { flex-wrap: wrap; }
      .tabs { padding: 10px 18px 0; }
      .drawer-scroll { padding: 18px; }
      .field-row { flex-direction: column; gap: 0; }
      .chat-scroll { padding: 18px; }
      .chat-input { padding: 12px 16px; }
      .bubble { max-width: 90%; }
    }

    @media (max-width: 480px) {
      .page-header h1 { font-size: 22px; }
      .agent-card { padding: 18px; }
      .drawer-title-group h2 { font-size: 19px; }
      .drawer-actions { flex-wrap: wrap; }
      .drawer-actions .btn { flex: 1 1 auto; }
    }
  `],
})
export class AiAgentsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirmSvc = inject(ConfirmService);

  @ViewChild('promptTextarea') promptTextareaEl?: ElementRef<HTMLTextAreaElement>;

  readonly exampleToken = '{{SEND_FILE:alias}}';
  fileToken(alias: string) { return '{{SEND_FILE:' + alias + '}}'; }

  readonly Bot = Bot; readonly Plus = Plus; readonly X = X; readonly Trash2 = Trash2;
  readonly Send = Send; readonly Upload = Upload; readonly FileText = FileText;
  readonly MessageSquare = MessageSquare; readonly Smartphone = Smartphone; readonly Check = Check;
  readonly Sparkles = Sparkles; readonly BookOpen = BookOpen; readonly Phone = Phone;
  readonly RefreshCw = RefreshCw; readonly Power = Power; readonly Pencil = Pencil;
  readonly FlaskConical = FlaskConical; readonly Paperclip = Paperclip; readonly Copy = Copy;
  readonly Instagram = Instagram; readonly Settings = Settings;

  readonly sections: { key: Section; label: string; icon: typeof Bot }[] = [
    { key: 'general', label: 'General', icon: Bot },
    { key: 'channels', label: 'Canales', icon: Smartphone },
    { key: 'knowledge', label: 'Conocimiento', icon: BookOpen },
    { key: 'files', label: 'Archivos', icon: Paperclip },
    { key: 'advanced', label: 'Avanzado', icon: Sparkles },
  ];

  agents = signal<Agent[]>([]);
  accounts = signal<WaAccount[]>([]);
  igAccounts = signal<IgAccount[]>([]);
  loading = signal(true);

  // editor
  drawerOpen = signal(false);
  section = signal<Section>('general');
  form: Agent = blankAgent();
  saving = signal(false);
  docs = signal<KDoc[]>([]);
  uploading = signal(false);

  // agent files
  agentFiles = signal<AgentFile[]>([]);
  uploadingFile = signal(false);
  newFileAlias = '';
  newFileName = '';

  // playground
  playgroundAgent = signal<Agent | null>(null);
  chat = signal<{ role: 'user' | 'assistant'; content: string }[]>([]);
  chatInput = '';
  sending = signal(false);

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.playgroundAgent()) { this.closePlayground(); return; }
    if (this.drawerOpen()) this.closeDrawer();
  }

  ngOnInit() {
    this.load();
    this.loadAccounts();
    this.loadIgAccounts();
  }

  load() {
    this.loading.set(true);
    this.http.get<Agent[]>(`${API}/ai-agents`).subscribe({
      next: a => { this.agents.set(a); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  /** Cuentas conectadas en Configuración — acá solo se seleccionan (lectura). */
  loadAccounts() {
    this.http.get<WaAccount[]>(`${API}/whatsapp-accounts`).subscribe({
      next: a => this.accounts.set(a),
      error: () => {},
    });
  }

  loadIgAccounts() {
    this.http.get<IgAccount[]>(`${API}/instagram-accounts`).subscribe({
      next: a => this.igAccounts.set(a),
      error: () => {},
    });
  }

  // ---- Editor ----
  openNew() {
    this.form = blankAgent();
    this.docs.set([]);
    this.agentFiles.set([]);
    this.newFileAlias = '';
    this.newFileName = '';
    this.section.set('general');
    this.drawerOpen.set(true);
  }

  openEdit(a: Agent) {
    this.form = { ...a, accountIds: [...(a.accountIds || [])], instagramAccountIds: [...(a.instagramAccountIds || [])] };
    this.section.set('general');
    this.docs.set([]);
    this.agentFiles.set([]);
    this.newFileAlias = '';
    this.newFileName = '';
    this.drawerOpen.set(true);
    this.loadDocs(a._id);
    this.loadFiles(a._id);
  }

  closeDrawer() { this.drawerOpen.set(false); }

  toggleAccount(id: string) {
    const ids = this.form.accountIds.includes(id)
      ? this.form.accountIds.filter(x => x !== id)
      : [...this.form.accountIds, id];
    this.form = { ...this.form, accountIds: ids };
  }

  toggleIgAccount(id: string) {
    const ids = this.form.instagramAccountIds.includes(id)
      ? this.form.instagramAccountIds.filter(x => x !== id)
      : [...this.form.instagramAccountIds, id];
    this.form = { ...this.form, instagramAccountIds: ids };
  }

  save() {
    if (!this.form.name.trim() || !this.form.systemPrompt.trim()) {
      this.toast.error('Nombre y prompt son obligatorios');
      return;
    }
    this.saving.set(true);
    const { _id, ...body } = this.form;
    const req = _id
      ? this.http.patch<Agent>(`${API}/ai-agents/${_id}`, body)
      : this.http.post<Agent>(`${API}/ai-agents`, body);
    req.subscribe({
      next: (a) => {
        this.toast.success(this.form._id ? 'Agente actualizado' : 'Agente creado');
        this.saving.set(false);
        if (!this.form._id) {
          this.form = { ...this.form, _id: a._id };
          this.loadFiles(a._id);
        }
        this.load();
      },
      error: (err) => { this.toast.error(err?.error?.message || 'Error al guardar'); this.saving.set(false); },
    });
  }

  async remove(a: Agent) {
    const ok = await this.confirmSvc.confirm({
      title: 'Eliminar agente', message: `¿Eliminar "${a.name}" y su base de conocimiento?`,
      confirmText: 'Eliminar', danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/ai-agents/${a._id}`).subscribe({
      next: () => { this.toast.success('Agente eliminado'); this.load(); },
      error: (err) => this.toast.error(err?.error?.message || 'Error al eliminar'),
    });
  }

  // ---- Knowledge ----
  loadDocs(agentId: string) {
    if (!agentId) return;
    this.http.get<KDoc[]>(`${API}/ai-agents/${agentId}/docs`).subscribe({
      next: d => this.docs.set(d),
      error: () => {},
    });
  }

  onFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.form._id) return;
    this.uploading.set(true);
    const fd = new FormData();
    fd.append('file', file);
    this.http.post<{ url: string; key: string; contentType: string }>(`${API}/upload?folder=agent-docs`, fd).subscribe({
      next: (up) => {
        this.http.post<KDoc>(`${API}/ai-agents/${this.form._id}/docs`, {
          filename: file.name, url: up.url, key: up.key, contentType: up.contentType,
        }).subscribe({
          next: () => {
            this.toast.success('Documento en proceso de indexación');
            this.uploading.set(false);
            this.loadDocs(this.form._id);
            setTimeout(() => this.loadDocs(this.form._id), 3500);
          },
          error: (err) => { this.toast.error(err?.error?.message || 'Error al indexar'); this.uploading.set(false); },
        });
      },
      error: (err) => { this.toast.error(err?.error?.message || 'Error al subir archivo'); this.uploading.set(false); },
    });
  }

  async deleteDoc(d: KDoc) {
    const ok = await this.confirmSvc.confirm({
      title: 'Eliminar documento', message: `¿Eliminar "${d.filename}" de la base de conocimiento?`,
      confirmText: 'Eliminar', danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/ai-agents/${this.form._id}/docs/${d._id}`).subscribe({
      next: () => { this.toast.success('Documento eliminado'); this.loadDocs(this.form._id); },
      error: (err) => this.toast.error(err?.error?.message || 'Error al eliminar'),
    });
  }

  // ---- Agent Files ----
  loadFiles(agentId: string) {
    if (!agentId) return;
    this.http.get<AgentFile[]>(`${API}/ai-agents/${agentId}/files`).subscribe({
      next: f => this.agentFiles.set(f),
      error: () => {},
    });
  }

  sanitizeAlias() {
    this.newFileAlias = this.newFileAlias.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
  }

  onAgentFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.form._id) return;
    if (!this.newFileAlias.trim()) {
      this.toast.error('Escribe un alias antes de seleccionar el archivo');
      (event.target as HTMLInputElement).value = '';
      return;
    }
    if (!this.newFileName.trim()) {
      this.toast.error('Escribe un nombre descriptivo antes de seleccionar el archivo');
      (event.target as HTMLInputElement).value = '';
      return;
    }
    this.uploadingFile.set(true);
    const fd = new FormData();
    fd.append('file', file);
    this.http.post<{ url: string; key: string; contentType: string }>(`${API}/upload?folder=agent-files`, fd).subscribe({
      next: (up) => {
        this.http.post<AgentFile>(`${API}/ai-agents/${this.form._id}/files`, {
          alias: this.newFileAlias.trim(),
          name: this.newFileName.trim(),
          filename: file.name,
          url: up.url,
          key: up.key,
          contentType: up.contentType,
        }).subscribe({
          next: () => {
            this.toast.success('Archivo registrado');
            this.uploadingFile.set(false);
            this.newFileAlias = '';
            this.newFileName = '';
            (event.target as HTMLInputElement).value = '';
            this.loadFiles(this.form._id);
          },
          error: (err) => {
            this.toast.error(err?.error?.message || 'Error al registrar archivo');
            this.uploadingFile.set(false);
          },
        });
      },
      error: (err) => { this.toast.error(err?.error?.message || 'Error al subir archivo'); this.uploadingFile.set(false); },
    });
  }

  async deleteAgentFile(f: AgentFile) {
    const ok = await this.confirmSvc.confirm({
      title: 'Eliminar archivo', message: `¿Eliminar "${f.name}"? El token {{SEND_FILE:${f.alias}}} dejará de funcionar.`,
      confirmText: 'Eliminar', danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/ai-agents/${this.form._id}/files/${f._id}`).subscribe({
      next: () => { this.toast.success('Archivo eliminado'); this.loadFiles(this.form._id); },
      error: (err) => this.toast.error(err?.error?.message || 'Error al eliminar'),
    });
  }

  insertToken(alias: string) {
    const token = `{{SEND_FILE:${alias}}}`;
    const ta = this.promptTextareaEl?.nativeElement;
    if (ta) {
      const start = ta.selectionStart ?? this.form.systemPrompt.length;
      const end = ta.selectionEnd ?? start;
      this.form = {
        ...this.form,
        systemPrompt: this.form.systemPrompt.slice(0, start) + token + this.form.systemPrompt.slice(end),
      };
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + token.length;
        ta.focus();
      });
    } else {
      this.form = { ...this.form, systemPrompt: this.form.systemPrompt + ' ' + token };
    }
  }

  copyToken(alias: string) {
    const token = `{{SEND_FILE:${alias}}}`;
    navigator.clipboard.writeText(token).then(() => this.toast.success('Token copiado'));
  }

  // ---- Playground ----
  openPlayground(a: Agent) {
    this.playgroundAgent.set(a);
    this.chat.set([]);
    this.chatInput = '';
  }
  closePlayground() { this.playgroundAgent.set(null); }
  resetChat() { this.chat.set([]); }

  sendChat() {
    const agent = this.playgroundAgent();
    const text = this.chatInput.trim();
    if (!agent || !text || this.sending()) return;
    this.chat.update(c => [...c, { role: 'user', content: text }]);
    this.chatInput = '';
    this.sending.set(true);
    this.http.post<{ reply: string; sources: number }>(`${API}/ai-agents/${agent._id}/test`, {
      messages: this.chat(),
    }).subscribe({
      next: (r) => { this.chat.update(c => [...c, { role: 'assistant', content: r.reply }]); this.sending.set(false); },
      error: (err) => {
        this.chat.update(c => [...c, { role: 'assistant', content: '⚠️ ' + (err?.error?.message || 'Error al responder') }]);
        this.sending.set(false);
      },
    });
  }

  kchars(n: number): number { return Math.round(n / 1000); }
}
