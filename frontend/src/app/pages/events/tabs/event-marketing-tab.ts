import { Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule, Check, Copy, Hash, Mail, Share2, Wand2, Zap } from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { EventsApiService } from '../../../core/api/events-api.service';
import { AiTool } from '../../../shared/models/event.model';
import { EventDetailStore } from '../event-detail.store';

@Component({
  selector: 'app-event-marketing-tab',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
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
  `,
  styles: [`
    :host { display: block; }

    .p-6 { padding: 24px; }

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
    @keyframes spin { to { transform: rotate(360deg) } }
    .ai-result-card { background:var(--color-bg-app); border-radius:16px; border:1px solid var(--color-border); overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.05); }
    .ai-result-header { padding:16px 24px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--color-border); font-size:14px; font-weight:700; color:var(--color-brand); text-transform:uppercase; background:rgba(255,255,255,0.5); }
    .ai-result-body { margin:0; padding:24px; font-size:15px; line-height:1.6; white-space:pre-wrap; font-family:inherit; color:var(--color-text-main); max-height:400px; overflow-y:auto; }
    .btn-icon-sm { background:none; border:none; display:flex; align-items:center; gap:6px; color:var(--color-text-muted); cursor:pointer; font-weight:600; transition:all 0.2s; padding:6px 12px; border-radius:6px; }
    .btn-icon-sm:hover { color:var(--color-brand); background:var(--color-brand-light); }

    @media (max-width: 768px) {
      .p-6 { padding: 16px; }

      .ai-hero-card { flex-direction: column; text-align: center; padding: 24px; gap: 16px; }
      .ai-tools-list { grid-template-columns: 1fr; }
    }

    @media (max-width: 480px) {
      .ai-hero-text h3 { font-size: 19px; }
      .ai-item-btn { padding: 16px; }
    }
  `],
})
export class EventMarketingTabComponent {
  private store = inject(EventDetailStore);
  private api = inject(EventsApiService);
  private toast = inject(ToastService);

  readonly Check = Check; readonly Copy = Copy; readonly Hash = Hash;
  readonly Mail = Mail; readonly Share2 = Share2; readonly Wand2 = Wand2; readonly Zap = Zap;

  aiLoading = signal(false);
  aiResult = signal('');
  aiTool = signal<AiTool | null>(null);
  copied = signal(false);

  aiResultLabel = computed(() => {
    const map: Record<AiTool, string> = {
      copy: 'Copy generado', social: 'Post para redes', hashtags: 'Hashtags', email: 'Email de invitación',
    };
    return this.aiTool() ? map[this.aiTool()!] : '';
  });

  runAI(tool: AiTool) {
    const id = this.store.eventId();
    if (!id) return;
    this.aiLoading.set(true);
    this.aiTool.set(tool);
    this.aiResult.set('');

    this.api.runAI(id, tool).subscribe({
      next: (res) => {
        if (tool === 'copy') {
          const r = res as { title: string; description: string };
          this.store.form.patchValue({ title: r.title, description: r.description });
          this.store.saveEvent();
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
}
