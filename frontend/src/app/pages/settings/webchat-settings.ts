import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, MessagesSquare, Copy, Loader2 } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

export interface WebWidgetConfig {
  _id: string;
  key: string;
  active: boolean;
  title: string;
  greeting: string;
  color: string;
  askContact: boolean;
  whatsappNumber: string;
  allowedDomains: string[];
  agentId: string | null;
  snippet: string;
}

interface AgentOption { _id: string; name: string; published?: boolean }

const API = environment.apiUrl;

/** Chat web para el sitio de la empresa (HU69). */
@Component({
  selector: 'app-webchat-settings',
  standalone: true,
  imports: [LucideAngularModule, FormsModule],
  template: `
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon"><lucide-icon [img]="MessagesSquare" [size]="22"></lucide-icon></div>
        <div>
          <h2 class="section-title">Chat web</h2>
          <p class="section-desc">Pega un código en tu página y atiende desde la bandeja, con tu agente de IA y tu equipo.</p>
        </div>
      </div>

      @if (!w()) {
        <div class="loading-row"><lucide-icon [img]="Loader2" [size]="18" class="spin"></lucide-icon> Cargando…</div>
      } @else {
        <label class="check">
          <input type="checkbox" [(ngModel)]="form.active" /> <span><strong>Chat activo</strong></span>
        </label>
        <div class="grid">
          <div>
            <label class="field-label" for="wc-domains">Dominios donde lo pegarás *</label>
            <textarea id="wc-domains" class="textarea" rows="3" [(ngModel)]="domains" placeholder="mitienda.pe&#10;blog.mitienda.pe"></textarea>
            <span class="field-hint">Uno por línea. En otros sitios el chat no carga.</span>
          </div>
          <div>
            <label class="field-label" for="wc-title">Título</label>
            <input id="wc-title" class="input" [(ngModel)]="form.title" maxlength="60" />
            <label class="field-label" for="wc-greeting">Saludo</label>
            <input id="wc-greeting" class="input" [(ngModel)]="form.greeting" maxlength="300" />
          </div>
          <div class="row">
            <div>
              <label class="field-label" for="wc-color">Color</label>
              <input id="wc-color" class="input color" type="color" [(ngModel)]="form.color" />
            </div>
            <div>
              <label class="field-label" for="wc-wa">WhatsApp (opcional)</label>
              <input id="wc-wa" class="input" [(ngModel)]="form.whatsappNumber" inputmode="tel" placeholder="51987654321" maxlength="20" />
            </div>
          </div>
          <div>
            <label class="field-label" for="wc-agent">Agente de IA</label>
            <select id="wc-agent" class="select" [(ngModel)]="form.agentId">
              <option [ngValue]="null">Sin agente (solo el equipo)</option>
              @for (a of agents(); track a._id) { <option [ngValue]="a._id">{{ a.name }}{{ a.published ? '' : ' (sin publicar)' }}</option> }
            </select>
            <label class="check">
              <input type="checkbox" [(ngModel)]="form.askContact" /> <span>Pedir nombre y teléfono o email antes de chatear</span>
            </label>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-primary btn-sm" (click)="save()" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
        </div>

        <label class="field-label" for="wc-snippet">Código para tu página (antes de &lt;/body&gt;)</label>
        <div class="snippet">
          <code id="wc-snippet">{{ w()!.snippet }}</code>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Copiar código" (click)="copy()"><lucide-icon [img]="Copy" [size]="14"></lucide-icon></button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; display: flex; flex-direction: column; gap: 12px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); display: grid; place-items: center; flex-shrink: 0;
      background: color-mix(in srgb, var(--color-brand) 10%, var(--color-white)); color: var(--color-brand); }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc { font-size: 13px; color: var(--color-text-muted); margin: 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; }
    .grid > div { display: flex; flex-direction: column; gap: 6px; }
    .row { display: grid !important; grid-template-columns: 96px 1fr; gap: 12px; }
    .row > div { display: flex; flex-direction: column; gap: 6px; }
    .color { padding: 4px; height: 42px; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 14px; }
    .field-hint { font-size: 12px; color: var(--color-text-muted); }
    .actions { display: flex; justify-content: flex-end; }
    .snippet { display: flex; gap: 8px; align-items: center; background: var(--color-bg-app); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 10px 14px; }
    .snippet code { flex: 1; font-size: 12px; word-break: break-all; }
    .loading-row { display: flex; align-items: center; gap: 10px; color: var(--color-text-muted); font-size: 14px; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 760px) { .section-card { padding: 20px; } .grid { grid-template-columns: 1fr; } }
  `],
})
export class WebchatSettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  readonly MessagesSquare = MessagesSquare; readonly Copy = Copy; readonly Loader2 = Loader2;

  w = signal<WebWidgetConfig | null>(null);
  agents = signal<AgentOption[]>([]);
  saving = signal(false);
  form = { active: false, title: '', greeting: '', color: '#4F46E5', askContact: false, whatsappNumber: '', agentId: null as string | null };
  domains = '';

  ngOnInit() {
    this.http.get<WebWidgetConfig>(`${API}/webchat/widget`).subscribe({
      next: (w) => this.apply(w),
      error: () => this.toast.error('No se pudo cargar el chat web'),
    });
    this.http.get<AgentOption[]>(`${API}/ai-agents`).subscribe({ next: (a) => this.agents.set(a), error: () => undefined });
  }

  private apply(w: WebWidgetConfig) {
    this.w.set(w);
    this.form = {
      active: w.active, title: w.title, greeting: w.greeting, color: w.color,
      askContact: w.askContact, whatsappNumber: w.whatsappNumber, agentId: w.agentId,
    };
    this.domains = w.allowedDomains.join('\n');
  }

  save() {
    const allowedDomains = this.domains.split(/[\n,]/).map((d) => d.trim()).filter(Boolean);
    if (this.form.active && !allowedDomains.length) {
      this.toast.error('Agrega al menos un dominio donde pegarás el chat');
      return;
    }
    this.saving.set(true);
    this.http.put<WebWidgetConfig>(`${API}/webchat/widget`, { ...this.form, allowedDomains }).subscribe({
      next: (w) => { this.saving.set(false); this.apply(w); this.toast.success('Chat web guardado'); },
      error: (err) => { this.saving.set(false); this.toast.error(err.error?.message || 'No se pudo guardar'); },
    });
  }

  copy() {
    navigator.clipboard.writeText(this.w()!.snippet).then(
      () => this.toast.success('Código copiado'),
      () => this.toast.error('No se pudo copiar'),
    );
  }
}
