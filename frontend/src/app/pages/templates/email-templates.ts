import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule, Plus, Pencil, Trash2, X, Copy, Sparkles, LayoutTemplate, Code, Blocks,
  MessageSquare, Mail,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { PermissionsService } from '../../auth/permissions.service';
import {
  EmailTemplateSummary, TemplateVariable, TemplatesApiService,
} from '../../core/api/templates-api.service';
import { EmailEditorComponent, EmailEditorDraft } from './email-editor';
import { StarterTemplate, compileEmail, emptyDesign, normalizeDesign, starterTemplates } from './email-design';

type ErrorLike = { error?: { message?: string } };

const TONES = [
  { key: 'amigable', label: 'Amigable' },
  { key: 'profesional', label: 'Profesional' },
  { key: 'exclusivo', label: 'Exclusivo' },
  { key: 'urgente', label: 'Urgente' },
  { key: 'informativo', label: 'Informativo' },
];

/** Plantillas HTML de email: galería, creación con IA y editor. */
@Component({
  selector: 'app-email-templates',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe, RouterLink, EmailEditorComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Plantillas de email</h1>
          <p class="page-sub">
            Diseña correos con bloques, pega tu propio HTML o deja que la IA proponga uno.
            Luego úsalos en tus campañas masivas.
          </p>
        </div>
        <div class="header-actions">
          <a class="btn btn-secondary" routerLink="/plantillas-texto">
            <lucide-icon [img]="MessageSquare" [size]="16"></lucide-icon>
            Plantillas de mensaje
          </a>
          @if (canCreate()) {
            <button class="btn btn-secondary" (click)="openAi()">
              <lucide-icon [img]="Sparkles" [size]="16"></lucide-icon>
              Crear con IA
            </button>
            <button class="btn btn-primary" (click)="newBlank('blocks')">
              <lucide-icon [img]="Plus" [size]="17" [strokeWidth]="2.5"></lucide-icon>
              Nueva plantilla
            </button>
          }
        </div>
      </div>

      @if (canCreate()) {
        <h2 class="section">Empieza desde un diseño</h2>
        <div class="starters">
          @for (s of starters; track s.key) {
            <button class="starter card" (click)="fromStarter(s)">
              <span class="starter-swatch" [style.background]="s.design.settings.brandColor"></span>
              <span class="starter-name">{{ s.name }}</span>
              <span class="starter-desc">{{ s.description }}</span>
            </button>
          }
          <button class="starter card" (click)="newBlank('html')">
            <span class="starter-swatch code"><lucide-icon [img]="Code" [size]="18"></lucide-icon></span>
            <span class="starter-name">Pegar mi HTML</span>
            <span class="starter-desc">Trae un diseño hecho en otra herramienta.</span>
          </button>
        </div>
      }

      <h2 class="section">Tus plantillas</h2>
      @if (loading()) {
        <div class="grid">
          @for (i of [1, 2, 3]; track i) { <div class="card skeleton"></div> }
        </div>
      } @else if (!templates().length) {
        <div class="card empty">
          <lucide-icon [img]="LayoutTemplate" [size]="40" [strokeWidth]="1.5"></lucide-icon>
          <h3>Aún no tienes plantillas</h3>
          <p>Elige un diseño de arriba, crea una con IA o empieza en blanco.</p>
        </div>
      } @else {
        <div class="grid">
          @for (t of templates(); track t._id) {
            <article class="card tpl">
              <div class="tpl-head">
                <span class="badge" [class.badge-info]="t.mode === 'blocks'" [class.badge-neutral]="t.mode === 'html'">
                  <lucide-icon [img]="t.mode === 'blocks' ? Blocks : Code" [size]="12"></lucide-icon>
                  {{ t.mode === 'blocks' ? 'Bloques' : 'HTML' }}
                </span>
                <span class="tpl-date">{{ t.updatedAt | date: 'dd/MM/yyyy' }}</span>
              </div>
              <h3 class="tpl-name">{{ t.name }}</h3>
              <p class="tpl-subject">
                <lucide-icon [img]="Mail" [size]="13"></lucide-icon>
                {{ t.subject || 'Sin asunto' }}
              </p>
              <div class="tpl-actions">
                @if (canEdit()) {
                  <button class="btn btn-secondary btn-sm" (click)="edit(t)" [disabled]="opening() === t._id">
                    <lucide-icon [img]="Pencil" [size]="14"></lucide-icon>
                    {{ opening() === t._id ? 'Abriendo…' : 'Editar' }}
                  </button>
                }
                <span class="spacer"></span>
                @if (canCreate()) {
                  <button class="btn btn-ghost btn-sm btn-icon" (click)="duplicate(t)" aria-label="Duplicar plantilla">
                    <lucide-icon [img]="Copy" [size]="15"></lucide-icon>
                  </button>
                }
                @if (canDelete()) {
                  <button class="btn btn-ghost btn-sm btn-icon" (click)="remove(t)" aria-label="Eliminar plantilla">
                    <lucide-icon [img]="Trash2" [size]="15"></lucide-icon>
                  </button>
                }
              </div>
            </article>
          }
        </div>
      }
    </div>

    @if (aiOpen()) {
      <div class="overlay" (click)="aiOpen.set(false)" role="dialog" aria-modal="true" aria-label="Crear plantilla con IA">
        <div class="modal card" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h3><lucide-icon [img]="Sparkles" [size]="18"></lucide-icon> Crear con IA</h3>
            <button class="btn btn-ghost btn-icon" (click)="aiOpen.set(false)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="18"></lucide-icon>
            </button>
          </div>
          <label class="field">
            <span class="label">¿Qué quieres comunicar?</span>
            <textarea class="textarea" rows="4" [(ngModel)]="ai.brief" maxlength="1500"
              placeholder="Ej. Lanzamos un plan anual con 20% de descuento hasta fin de mes para clientes actuales."></textarea>
          </label>
          <div class="field">
            <span class="label">Tono</span>
            <div class="chips">
              @for (t of tones; track t.key) {
                <button type="button" class="chip" [class.active]="ai.tone === t.key" (click)="ai.tone = t.key">{{ t.label }}</button>
              }
            </div>
          </div>
          <label class="field">
            <span class="label">¿Qué debe hacer quien lo lee? (opcional)</span>
            <input class="input" [(ngModel)]="ai.goal" maxlength="200" placeholder="Ej. Agendar una llamada" />
          </label>
          <div class="row2">
            <label class="field">
              <span class="label">Enlace del botón (opcional)</span>
              <input class="input" [(ngModel)]="ai.ctaUrl" maxlength="500" placeholder="https://…" />
            </label>
            <label class="field color-field">
              <span class="label">Color</span>
              <input class="color" type="color" [(ngModel)]="ai.brandColor" />
            </label>
          </div>
          <p class="hint">Si no pones enlace, el botón usará el link corto de cada destinatario.</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" (click)="aiOpen.set(false)">Cancelar</button>
            <button class="btn btn-primary" (click)="generate()" [disabled]="generating() || ai.brief.trim().length < 10">
              <lucide-icon [img]="Sparkles" [size]="15"></lucide-icon>
              {{ generating() ? 'Diseñando…' : 'Generar diseño' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (draft(); as d) {
      <app-email-editor [draft]="d" [variables]="variables()" (saved)="onSaved()" (closed)="draft.set(null)" />
    }
  `,
  styles: [`
    .page { width:100%; box-sizing:border-box; padding:32px 40px; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; margin-bottom:28px; flex-wrap:wrap; }
    h1 { font-family:var(--font-heading); margin:0 0 6px; }
    .page-sub { color:var(--color-text-muted); margin:0; max-width:640px; }
    .header-actions { display:flex; gap:10px; flex-wrap:wrap; }
    .section { font-family:var(--font-heading); font-size:16px; margin:0 0 14px; }
    .starters { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:16px; margin-bottom:32px; }
    .starter { display:flex; flex-direction:column; align-items:flex-start; gap:6px; padding:20px; text-align:left; cursor:pointer;
      border:1px solid var(--color-border); font-family:var(--font-base); transition:all var(--transition-fast); }
    .starter:hover { border-color:var(--color-brand); box-shadow:var(--shadow-md); transform:translateY(-2px); }
    .starter-swatch { width:44px; height:44px; border-radius:var(--radius-md); margin-bottom:6px; display:grid; place-items:center; }
    .starter-swatch.code { background:var(--color-bg-light); color:var(--color-text-muted); }
    .starter-name { font-weight:600; color:var(--color-text-main); }
    .starter-desc { font-size:12px; color:var(--color-text-muted); }
    .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:20px; }
    .skeleton { height:150px; background:var(--color-bg-light); }
    .tpl { display:flex; flex-direction:column; gap:8px; padding:24px; }
    .tpl-head { display:flex; justify-content:space-between; align-items:center; }
    .tpl-date { font-size:12px; color:var(--color-text-muted); }
    .tpl-name { margin:4px 0 0; font-size:16px; font-family:var(--font-heading); overflow-wrap:anywhere; }
    .tpl-subject { display:flex; align-items:center; gap:6px; margin:0; font-size:13px; color:var(--color-text-muted); overflow-wrap:anywhere; flex:1; }
    .tpl-actions { display:flex; align-items:center; gap:4px; margin-top:10px; }
    .spacer { flex:1; }
    .empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; padding:56px 24px; color:var(--color-text-muted); }
    .empty h3 { margin:8px 0 0; color:var(--color-text-main); font-family:var(--font-heading); }
    .empty p { margin:0; }

    .overlay { position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px); display:flex;
      align-items:center; justify-content:center; z-index:100; }
    .modal { width:calc(100% - 48px); max-width:480px; padding:28px 32px; display:flex; flex-direction:column; gap:14px;
      max-height:calc(100vh - 48px); overflow-y:auto; box-sizing:border-box; }
    .modal-head { display:flex; justify-content:space-between; align-items:center; }
    .modal-head h3 { margin:0; font-family:var(--font-heading); display:flex; align-items:center; gap:8px; }
    .modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:6px; }
    .field { display:flex; flex-direction:column; gap:8px; }
    .label { font-size:13px; font-weight:600; color:var(--color-text-main); }
    .row2 { display:grid; grid-template-columns:1fr 90px; gap:12px; }
    .color { width:100%; height:42px; padding:2px; border:1px solid var(--color-border); border-radius:var(--radius-md);
      background:var(--color-white); cursor:pointer; box-sizing:border-box; }
    .hint { margin:0; font-size:12px; color:var(--color-text-muted); }
    .chips { display:flex; gap:8px; flex-wrap:wrap; }
    .chip { padding:7px 14px; font-family:var(--font-base); font-size:13px; font-weight:500; border-radius:var(--radius-pill);
      border:1px solid var(--color-border); background:var(--color-white); color:var(--color-text-muted); cursor:pointer;
      transition:all var(--transition-fast); }
    .chip.active { background:var(--color-brand); border-color:var(--color-brand); color:var(--color-white); }

    @media (max-width: 768px) { .page { padding:20px 16px; } }
  `],
})
export class EmailTemplatesComponent implements OnInit {
  private api = inject(TemplatesApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private permissions = inject(PermissionsService);

  readonly Plus = Plus; readonly Pencil = Pencil; readonly Trash2 = Trash2; readonly X = X;
  readonly Copy = Copy; readonly Sparkles = Sparkles; readonly LayoutTemplate = LayoutTemplate;
  readonly Code = Code; readonly Blocks = Blocks; readonly MessageSquare = MessageSquare; readonly Mail = Mail;

  readonly starters = starterTemplates();
  readonly tones = TONES;

  templates = signal<EmailTemplateSummary[]>([]);
  variables = signal<TemplateVariable[]>([]);
  loading = signal(true);
  opening = signal<string | null>(null);
  draft = signal<EmailEditorDraft | null>(null);
  aiOpen = signal(false);
  generating = signal(false);

  ai = { brief: '', tone: 'amigable', goal: '', ctaUrl: '', brandColor: '#6d28d9' };

  canCreate = computed(() => this.permissions.canAct('campaigns', 'create'));
  canEdit = computed(() => this.permissions.canAct('campaigns', 'edit'));
  canDelete = computed(() => this.permissions.canAct('campaigns', 'delete'));

  ngOnInit() {
    this.load();
    this.api.variables().subscribe({ next: v => this.variables.set(v), error: () => {} });
  }

  @HostListener('document:keydown.escape')
  onEscape() { if (this.aiOpen() && !this.draft()) this.aiOpen.set(false); }

  private load() {
    this.loading.set(true);
    this.api.emailTemplates().subscribe({
      next: t => { this.templates.set(t); this.loading.set(false); },
      error: (err: ErrorLike) => {
        this.loading.set(false);
        this.toast.error(err.error?.message || 'No se pudieron cargar las plantillas');
      },
    });
  }

  newBlank(mode: 'blocks' | 'html') {
    const design = emptyDesign();
    this.draft.set({
      name: 'Plantilla sin título',
      subject: '',
      preheader: '',
      mode,
      design: mode === 'blocks' ? design : undefined,
      html: mode === 'blocks' ? compileEmail(design) : '',
    });
  }

  fromStarter(s: StarterTemplate) {
    // Copia profunda: el editor no debe mutar el diseño de la galería.
    const design = normalizeDesign(JSON.parse(JSON.stringify(s.design)));
    this.draft.set({
      name: s.name,
      subject: s.subject,
      preheader: s.preheader,
      mode: 'blocks',
      design,
      html: compileEmail(design, s),
    });
  }

  edit(t: EmailTemplateSummary) {
    this.opening.set(t._id);
    this.api.emailTemplate(t._id).subscribe({
      next: full => {
        this.opening.set(null);
        this.draft.set({
          _id: full._id,
          name: full.name,
          subject: full.subject,
          preheader: full.preheader,
          mode: full.mode,
          design: full.design,
          html: full.html,
        });
      },
      error: (err: ErrorLike) => {
        this.opening.set(null);
        this.toast.error(err.error?.message || 'No se pudo abrir la plantilla');
      },
    });
  }

  onSaved() { this.load(); }

  duplicate(t: EmailTemplateSummary) {
    this.api.duplicateEmailTemplate(t._id).subscribe({
      next: () => { this.toast.success('Plantilla duplicada'); this.load(); },
      error: (err: ErrorLike) => this.toast.error(err.error?.message || 'No se pudo duplicar'),
    });
  }

  async remove(t: EmailTemplateSummary) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar plantilla',
      message: 'Se eliminará "' + t.name + '". Las campañas ya enviadas no cambian.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.deleteEmailTemplate(t._id).subscribe({
      next: () => { this.toast.success('Plantilla eliminada'); this.load(); },
      error: (err: ErrorLike) => this.toast.error(err.error?.message || 'No se pudo eliminar'),
    });
  }

  openAi() {
    this.aiOpen.set(true);
    setTimeout(() => document.querySelector<HTMLTextAreaElement>('.modal .textarea')?.focus());
  }

  generate() {
    this.generating.set(true);
    this.api
      .generateEmail({
        brief: this.ai.brief.trim(),
        tone: this.ai.tone,
        goal: this.ai.goal.trim() || undefined,
        ctaUrl: this.ai.ctaUrl.trim() || undefined,
        brandColor: this.ai.brandColor,
      })
      .subscribe({
        next: res => {
          this.generating.set(false);
          this.aiOpen.set(false);
          const design = normalizeDesign(res.design);
          this.draft.set({
            name: res.subject || 'Plantilla con IA',
            subject: res.subject,
            preheader: res.preheader,
            mode: 'blocks',
            design,
            html: compileEmail(design, res),
          });
          this.toast.success('Diseño generado: revísalo y guárdalo');
        },
        error: (err: ErrorLike) => {
          this.generating.set(false);
          this.toast.error(err.error?.message || 'La IA no pudo generar el diseño');
        },
      });
  }
}
