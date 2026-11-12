import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, ArrowLeft, Sparkles, Save, RefreshCw } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export interface GeneratorInput {
  businessName: string;
  industry: string;
  offer: string;
  goal: string;
  tone: 'cercano' | 'formal' | 'entusiasta';
  language: 'es' | 'en' | 'pt';
  faqs: string;
  handoffWhen: string;
  restrictions: string;
}

export interface AgentDraft {
  name: string;
  description: string;
  systemPrompt: string;
  greeting: string;
  handoffInstructions: string;
}

const errorText = (err: HttpErrorResponse, fallback: string) => {
  const m = (err.error as { message?: string | string[] } | null)?.message;
  return (Array.isArray(m) ? m[0] : m) || fallback;
};

@Component({
  selector: 'app-agent-generator',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <a routerLink="/ai-agents" class="back-link">
        <lucide-icon [img]="ArrowLeft" [size]="16"></lucide-icon> Agentes IA
      </a>
      <div class="page-header">
        <h1>Generar agente con IA</h1>
        <p class="page-sub">Cuéntanos de tu negocio y la IA escribe el prompt completo. Lo revisas, lo ajustas y lo creas como borrador.</p>
      </div>

      <form class="card form-grid" (ngSubmit)="generate()" #f="ngForm">
        <label class="field">
          <span>Nombre del negocio *</span>
          <input class="input" name="businessName" [(ngModel)]="input.businessName" required maxlength="120" />
        </label>
        <label class="field">
          <span>Rubro *</span>
          <input class="input" name="industry" [(ngModel)]="input.industry" required maxlength="120" placeholder="Farmacia, seguros, inmobiliaria…" />
        </label>
        <label class="field wide">
          <span>Qué ofrece *</span>
          <textarea class="textarea" name="offer" rows="4" [(ngModel)]="input.offer" required maxlength="3000"
            placeholder="Productos o servicios, precios orientativos, zona de atención, horarios…"></textarea>
        </label>
        <label class="field wide">
          <span>Qué debe lograr el agente *</span>
          <textarea class="textarea" name="goal" rows="2" [(ngModel)]="input.goal" required maxlength="1000"
            placeholder="Agendar una llamada, vender por WhatsApp, calificar leads, resolver dudas…"></textarea>
        </label>
        <label class="field">
          <span>Tono</span>
          <select class="select" name="tone" [(ngModel)]="input.tone">
            <option value="cercano">Cercano</option>
            <option value="formal">Formal</option>
            <option value="entusiasta">Entusiasta</option>
          </select>
        </label>
        <label class="field">
          <span>Idioma principal</span>
          <select class="select" name="language" [(ngModel)]="input.language">
            <option value="es">Español</option>
            <option value="en">Inglés</option>
            <option value="pt">Portugués</option>
          </select>
        </label>
        <label class="field wide">
          <span>Preguntas frecuentes (opcional)</span>
          <textarea class="textarea" name="faqs" rows="3" [(ngModel)]="input.faqs" maxlength="3000"
            placeholder="¿Hacen delivery? Sí, en Lima en 2 horas…"></textarea>
        </label>
        <label class="field">
          <span>Cuándo pasar a una persona (opcional)</span>
          <textarea class="textarea" name="handoffWhen" rows="2" [(ngModel)]="input.handoffWhen" maxlength="1000"></textarea>
        </label>
        <label class="field">
          <span>Lo que nunca debe hacer (opcional)</span>
          <textarea class="textarea" name="restrictions" rows="2" [(ngModel)]="input.restrictions" maxlength="1000"></textarea>
        </label>
        <div class="form-actions wide">
          <button type="submit" class="btn btn-primary" [disabled]="f.invalid || generating()">
            <lucide-icon [img]="draft() ? RefreshCw : Sparkles" [size]="16"></lucide-icon>
            {{ generating() ? 'Generando…' : draft() ? 'Volver a generar' : 'Generar agente' }}
          </button>
        </div>
        @if (generating()) { <p class="hint wide" role="status">Escribiendo el prompt. Puede tardar hasta 2 minutos.</p> }
      </form>

      @if (draft(); as d) {
        <section class="card form-grid draft">
          <h2 class="wide">Revisa el borrador</h2>
          <label class="field">
            <span>Nombre del agente</span>
            <input class="input" name="draftName" [(ngModel)]="d.name" maxlength="80" />
          </label>
          <label class="field">
            <span>Descripción</span>
            <input class="input" name="draftDescription" [(ngModel)]="d.description" maxlength="300" />
          </label>
          <label class="field wide">
            <span>Saludo inicial</span>
            <input class="input" name="draftGreeting" [(ngModel)]="d.greeting" maxlength="500" />
          </label>
          <label class="field wide">
            <span>Cuándo derivar a una persona</span>
            <textarea class="textarea" name="draftHandoff" rows="2" [(ngModel)]="d.handoffInstructions"></textarea>
          </label>
          <label class="field wide">
            <span>Prompt del sistema</span>
            <textarea class="textarea prompt" name="draftPrompt" rows="22" [(ngModel)]="d.systemPrompt"></textarea>
          </label>
          <p class="hint wide">Se crea como borrador, sin canales conectados ni derivación activa. Después lo pruebas, le conectas canales, eliges a quién avisar al derivar y lo publicas.</p>
          <div class="form-actions wide">
            <button class="btn btn-primary" (click)="create()" [disabled]="saving() || !d.name.trim() || !d.systemPrompt.trim()">
              <lucide-icon [img]="Save" [size]="16"></lucide-icon>
              {{ saving() ? 'Creando…' : 'Crear agente' }}
            </button>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; display: flex; flex-direction: column; gap: 20px; }
    .back-link { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-muted); text-decoration: none; font-weight: 600; font-size: 14px; }
    .back-link:hover { color: var(--color-brand); }
    .page-header h1 { font-family: var(--font-heading); margin: 0 0 4px; }
    .page-sub { margin: 0; color: var(--color-text-muted); }
    .card { padding: 24px; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; }
    .wide { grid-column: 1 / -1; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: var(--color-text-muted); }
    .prompt { font-family: var(--font-base); font-size: 13px; line-height: 1.5; }
    .form-actions { display: flex; justify-content: flex-end; }
    .hint { margin: 0; color: var(--color-text-muted); font-size: 13px; }
    h2 { margin: 0; font-size: 18px; }
    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .form-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class AgentGeneratorComponent {
  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly ArrowLeft = ArrowLeft; readonly Sparkles = Sparkles; readonly Save = Save; readonly RefreshCw = RefreshCw;

  input: GeneratorInput = {
    businessName: '', industry: '', offer: '', goal: '',
    tone: 'cercano', language: 'es', faqs: '', handoffWhen: '', restrictions: '',
  };
  draft = signal<AgentDraft | null>(null);
  generating = signal(false);
  saving = signal(false);

  generate() {
    this.generating.set(true);
    // Los opcionales vacíos no se envían.
    const body = Object.fromEntries(
      Object.entries(this.input).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ''),
    );
    this.http.post<AgentDraft>(`${API}/ai-agents/generate`, body).subscribe({
      next: (d) => {
        this.draft.set({ ...d });
        this.generating.set(false);
        this.toast.success('Borrador listo: revísalo antes de crear el agente');
      },
      error: (e: HttpErrorResponse) => {
        this.generating.set(false);
        this.toast.error(errorText(e, 'No se pudo generar el agente'));
      },
    });
  }

  create() {
    const d = this.draft();
    if (!d) return;
    this.saving.set(true);
    const handoff = d.handoffInstructions.trim();
    this.http
      .post<{ _id: string }>(`${API}/ai-agents`, {
        name: d.name.trim(),
        description: d.description.trim(),
        systemPrompt: d.systemPrompt,
        greeting: d.greeting.trim(),
        // Se deja apagada: aún no hay a quién avisar. Se activa en el editor
        // al elegir los destinatarios.
        handoffEnabled: false,
        handoffInstructions: handoff,
        published: false,
      })
      .subscribe({
        next: (a) => {
          this.saving.set(false);
          this.toast.success('Agente creado como borrador');
          void this.router.navigate(['/ai-agents'], { queryParams: { edit: a._id } });
        },
        error: (e: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.error(errorText(e, 'No se pudo crear el agente'));
        },
      });
  }
}
