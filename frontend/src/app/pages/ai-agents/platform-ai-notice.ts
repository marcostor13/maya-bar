import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule, Sparkles } from 'lucide-angular';
import { environment } from '../../../environments/environment';

interface PlatformAiStatus { active: boolean; provider?: string; model?: string }

const PROVIDER_LABEL: Record<string, string> = {
  deepseek: 'DeepSeek', claude: 'Claude', openai: 'OpenAI', gemini: 'Gemini',
};

/** Aviso en Avanzado: la empresa usa la IA de la plataforma, gratis y con modelo fijo (HU85). */
@Component({
  selector: 'app-platform-ai-notice',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    @if (status(); as s) {
      @if (s.active) {
        <div class="notice" role="note" data-test="platform-ai-notice">
          <lucide-icon [img]="Sparkles" [size]="18" />
          <p>
            Tu empresa usa la <strong>IA de Maya</strong> ({{ label(s.provider) }} · {{ s.model }}) sin gastar créditos.
            Mientras no conectes tu propia API key en Configuración, el proveedor y el modelo de abajo no se aplican.
          </p>
        </div>
      }
    }
  `,
  styles: [`
    .notice { display: flex; gap: 10px; align-items: flex-start; padding: 14px 16px; margin-bottom: 16px;
      border-radius: var(--radius-lg); background: var(--color-brand-light); color: var(--color-text-main); font-size: 13px; }
    .notice p { margin: 0; line-height: 1.5; }
    .notice lucide-icon { color: var(--color-ai); flex-shrink: 0; margin-top: 1px; }
  `],
})
export class PlatformAiNoticeComponent implements OnInit {
  private http = inject(HttpClient);
  readonly Sparkles = Sparkles;
  status = signal<PlatformAiStatus | null>(null);

  ngOnInit() {
    this.http.get<PlatformAiStatus>(`${environment.apiUrl}/ai-agents/platform-ai`).subscribe({
      next: s => this.status.set(s),
      // Sin el aviso la pantalla sigue funcionando igual.
      error: () => this.status.set(null),
    });
  }

  label(p?: string) { return (p && PROVIDER_LABEL[p]) || p || ''; }
}
