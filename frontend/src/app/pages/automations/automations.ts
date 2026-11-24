import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Workflow, Plus, Trash2, ArrowUp, ArrowDown, Play, Pause, Clock, MessageCircle,
  Mail, MessageSquare, Tag, Target, UserCheck, Bell, Webhook, GitBranch, Copy, LogOut,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { FormPageComponent } from '../../shared/form-page';
import { environment } from '../../../environments/environment';

export type TriggerType = 'form_submitted' | 'contact_created' | 'tag_added' | 'stage_changed' | 'event_registered' | 'no_reply' | 'date_field' | 'email_opened' | 'email_clicked' | 'score_reached';
export type StepType = 'wait' | 'whatsapp' | 'email' | 'sms' | 'tag' | 'untag' | 'stage' | 'assign' | 'reminder' | 'webhook' | 'condition';

export interface Step {
  id?: string;
  type: StepType;
  minutes?: number; untilHour?: number; hoursBeforeEvent?: number;
  text?: string; subject?: string; accountId?: string;
  template?: { name: string; language?: string; variables?: string[] };
  tag?: string; stage?: string; userId?: string; title?: string; dueMinutes?: number; url?: string;
  condition?: 'replied' | 'not_replied' | 'has_tag' | 'lacks_tag' | 'score_at_least'; otherwise?: 'exit' | 'skip_next'; minScore?: number;
}
export interface Trigger { type: TriggerType; formId?: string; tag?: string; stage?: string; eventId?: string; hours?: number; field?: string; offsetDays?: number; campaignId?: string; minScore?: number }
export interface Stats { entered: number; active: number; completed: number; replied: number; exited: number }
export interface Automation {
  _id: string; name: string; active: boolean; trigger: Trigger; steps: Step[]; exitOnReply: boolean;
  sendWindow?: { from: number; to: number } | null; stats: Stats; webhookSecret?: string;
  recent?: { _id: string; status: string; exitReason?: string; stepIndex: number; updatedAt: string; customerId?: { name?: string } }[];
}
interface Template { key: string; name: string; description: string }
interface Editing {
  _id?: string; name: string; trigger: Trigger; steps: Step[]; exitOnReply: boolean;
  useWindow: boolean; from: number; to: number; waitUnit: Record<number, 'min' | 'h' | 'd'>;
}

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  form_submitted: 'Envía un formulario', contact_created: 'Se crea un contacto', tag_added: 'Se añade una etiqueta',
  stage_changed: 'Una oportunidad cambia de etapa', event_registered: 'Se registra a un evento',
  no_reply: 'No responde en un tiempo', date_field: 'Llega una fecha del contacto',
  email_opened: 'Abre un email de campaña', email_clicked: 'Hace clic en un email de campaña',
  score_reached: 'El puntaje del lead llega a un valor',
};
export const STEP_LABEL: Record<StepType, string> = {
  wait: 'Esperar', whatsapp: 'Enviar WhatsApp', email: 'Enviar email', sms: 'Enviar SMS', tag: 'Añadir etiqueta',
  untag: 'Quitar etiqueta', stage: 'Mover de etapa', assign: 'Asignar responsable', reminder: 'Crear recordatorio',
  webhook: 'Llamar a un webhook', condition: 'Condición',
};
const EXIT_LABEL: Record<string, string> = {
  replied: 'Respondió', suppressed: 'No contactar', left_rule: 'Salió de la regla', condition: 'No cumplió la condición',
  paused: 'Sacado a mano', deleted: 'Regla borrada', no_contact: 'Contacto borrado',
};

/** Automatizaciones y secuencias (HU58). */
@Component({
  selector: 'app-automations',
  standalone: true,
  imports: [DatePipe, FormsModule, LucideAngularModule, FormPageComponent],
  template: `
    <div class="page animate-fade-in">
      <header class="head">
        <div>
          <h1>Automatizaciones</h1>
          <p class="muted">"Cuando pase esto, espera y haz aquello": seguimiento de cada contacto sin hacerlo a mano.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="openNew()"><lucide-icon [img]="Plus" [size]="16" /> Nueva automatización</button>
      </header>

      @if (templates().length) {
        <section class="tpls" aria-label="Plantillas">
          @for (t of templates(); track t.key) {
            <div class="card tpl">
              <strong>{{ t.name }}</strong>
              <p class="muted small">{{ t.description }}</p>
              <button type="button" class="btn btn-secondary btn-sm" [attr.data-tpl]="t.key" [disabled]="busy()" (click)="useTemplate(t)"><lucide-icon [img]="Copy" [size]="14" /> Usar plantilla</button>
            </div>
          }
        </section>
      }

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else if (!items().length) {
        <div class="card empty"><lucide-icon [img]="Workflow" [size]="32" /><p>Aún no tienes automatizaciones. Empieza con una plantilla.</p></div>
      } @else {
        <div class="list">
          @for (a of items(); track a._id) {
            <article class="card item" [attr.data-auto]="a._id">
              <div class="item-main">
                <div class="title-row">
                  <button type="button" class="link" (click)="openEdit(a)">{{ a.name }}</button>
                  <span class="badge" [class]="a.active ? 'badge-success' : 'badge-neutral'">{{ a.active ? 'Activa' : 'Pausada' }}</span>
                </div>
                <p class="muted small">{{ triggerText(a.trigger) }} · {{ a.steps.length }} pasos</p>
                <div class="stats">
                  <span><strong>{{ a.stats.entered }}</strong> entraron</span>
                  <span><strong>{{ a.stats.active }}</strong> en curso</span>
                  <span><strong>{{ a.stats.completed }}</strong> completaron</span>
                  <span><strong>{{ a.stats.replied }}</strong> respondieron</span>
                  <span><strong>{{ a.stats.exited }}</strong> salieron</span>
                </div>
              </div>
              <div class="item-actions">
                <button type="button" class="btn btn-sm" [class]="a.active ? 'btn-secondary' : 'btn-primary'" [disabled]="busy()" (click)="toggle(a)">
                  <lucide-icon [img]="a.active ? Pause : Play" [size]="14" /> {{ a.active ? 'Pausar' : 'Activar' }}
                </button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" [disabled]="busy()" (click)="remove(a)" aria-label="Eliminar"><lucide-icon [img]="Trash2" [size]="15" /></button>
              </div>
            </article>
          }
        </div>
      }
    </div>

    @if (editing(); as e) {
      <app-form-page [title]="e._id ? e.name : 'Nueva automatización'" subtitle="Disparador y pasos, de arriba abajo."
        backLabel="Automatizaciones" [urlKey]="e._id || 'nueva-automatizacion'" [dirty]="isDirty()" (closed)="editing.set(null)">
        <ng-container formActions>
          <button type="button" class="btn btn-ghost" (click)="editing.set(null)">Cancelar</button>
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="save()">Guardar</button>
        </ng-container>

        <div class="card block">
          <label for="a-name">Nombre</label>
          <input id="a-name" class="input" name="name" maxlength="120" [(ngModel)]="e.name" placeholder="Seguimiento de leads" />
        </div>

        <div class="card block">
          <h3>Cuando…</h3>
          <label for="a-trigger">Disparador</label>
          <select id="a-trigger" class="select" name="trigger" [(ngModel)]="e.trigger.type">
            @for (t of triggerTypes; track t) { <option [value]="t">{{ triggerLabel[t] }}</option> }
          </select>
          <div class="grid">
            @switch (e.trigger.type) {
              @case ('form_submitted') {
                <div><label for="t-form">Formulario</label>
                  <select id="t-form" class="select" name="formId" [(ngModel)]="e.trigger.formId">
                    <option [ngValue]="undefined">Cualquiera</option>
                    @for (f of forms(); track f._id) { <option [value]="f._id">{{ f.name }}</option> }
                  </select></div>
              }
              @case ('tag_added') {
                <div><label for="t-tag">Etiqueta</label><input id="t-tag" class="input" name="ttag" [(ngModel)]="e.trigger.tag" /></div>
              }
              @case ('stage_changed') {
                <div><label for="t-stage">Etapa</label>
                  <select id="t-stage" class="select" name="tstage" [(ngModel)]="e.trigger.stage">
                    @for (s of stages(); track s.key) { <option [value]="s.key">{{ s.label }}</option> }
                  </select></div>
              }
              @case ('event_registered') {
                <div><label for="t-event">Evento</label>
                  <select id="t-event" class="select" name="eventId" [(ngModel)]="e.trigger.eventId">
                    <option [ngValue]="undefined">Cualquiera</option>
                    @for (ev of events(); track ev._id) { <option [value]="ev._id">{{ ev.title }}</option> }
                  </select></div>
              }
              @case ('email_opened') {
                <div><label for="t-camp">Campaña</label>
                  <select id="t-camp" class="select" name="campaignId" [(ngModel)]="e.trigger.campaignId">
                    <option [ngValue]="undefined">Cualquiera</option>
                    @for (c of emailCampaigns(); track c._id) { <option [value]="c._id">{{ c.name }}</option> }
                  </select></div>
              }
              @case ('email_clicked') {
                <div><label for="t-camp2">Campaña</label>
                  <select id="t-camp2" class="select" name="campaignId" [(ngModel)]="e.trigger.campaignId">
                    <option [ngValue]="undefined">Cualquiera</option>
                    @for (c of emailCampaigns(); track c._id) { <option [value]="c._id">{{ c.name }}</option> }
                  </select></div>
              }
              @case ('score_reached') {
                <div><label for="t-score">Puntaje mínimo (1–100)</label><input id="t-score" class="input" type="number" min="1" max="100" name="minScore" [(ngModel)]="e.trigger.minScore" /></div>
              }
              @case ('no_reply') {
                <div><label for="t-hours">Horas sin respuesta</label><input id="t-hours" class="input" type="number" min="1" name="hours" [(ngModel)]="e.trigger.hours" /></div>
              }
              @case ('date_field') {
                <div><label for="t-field">Campo de fecha del contacto</label><input id="t-field" class="input" name="field" [(ngModel)]="e.trigger.field" placeholder="Cumpleaños" /></div>
                <div><label for="t-off">Días antes (−) o después (+)</label><input id="t-off" class="input" type="number" name="offset" [(ngModel)]="e.trigger.offsetDays" /></div>
              }
            }
          </div>
        </div>

        <ol class="steps">
          @for (s of e.steps; track $index; let i = $index) {
            <li class="card step" [attr.data-step]="i">
              <div class="step-head">
                <span class="step-n">{{ i + 1 }}</span>
                <lucide-icon [img]="stepIcon[s.type]" [size]="16" />
                <select class="select select-sm" [attr.aria-label]="'Tipo del paso ' + (i + 1)" [name]="'type' + i" [(ngModel)]="s.type">
                  @for (t of stepTypes; track t) { <option [value]="t">{{ stepLabel[t] }}</option> }
                </select>
                <span class="grow"></span>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" [disabled]="i === 0" (click)="move(i, -1)" aria-label="Subir"><lucide-icon [img]="ArrowUp" [size]="14" /></button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" [disabled]="i === e.steps.length - 1" (click)="move(i, 1)" aria-label="Bajar"><lucide-icon [img]="ArrowDown" [size]="14" /></button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="e.steps.splice(i, 1)" aria-label="Quitar paso"><lucide-icon [img]="Trash2" [size]="14" /></button>
              </div>
              <div class="grid">
                @switch (s.type) {
                  @case ('wait') {
                    <div><label [for]="'w' + i">Cuánto</label>
                      <div class="inline">
                        <input [id]="'w' + i" class="input" type="number" min="0" [name]="'wv' + i" [ngModel]="waitValue(e, i)" (ngModelChange)="setWait(e, i, $event)" />
                        <select class="select" aria-label="Unidad" [name]="'wu' + i" [ngModel]="e.waitUnit[i] || 'h'" (ngModelChange)="setUnit(e, i, $event)">
                          <option value="min">minutos</option><option value="h">horas</option><option value="d">días</option>
                        </select>
                      </div></div>
                    <div><label [for]="'wh' + i">Y hasta las (hora, opcional)</label>
                      <input [id]="'wh' + i" class="input" type="number" min="0" max="23" [name]="'wh' + i" [(ngModel)]="s.untilHour" /></div>
                    @if (e.trigger.type === 'event_registered') {
                      <div><label [for]="'we' + i">O N horas antes del evento</label>
                        <input [id]="'we' + i" class="input" type="number" min="0" [name]="'we' + i" [(ngModel)]="s.hoursBeforeEvent" /></div>
                    }
                  }
                  @case ('whatsapp') {
                    <div class="full"><label [for]="'tx' + i">Mensaje (si la ventana de 24 h está abierta)</label>
                      <textarea [id]="'tx' + i" class="textarea" rows="3" [name]="'tx' + i" [(ngModel)]="s.text" placeholder="Hola {nombre}…"></textarea></div>
                    <div><label [for]="'tp' + i">Plantilla aprobada (ventana cerrada)</label>
                      <select [id]="'tp' + i" class="select" [name]="'tp' + i" [ngModel]="s.template?.name" (ngModelChange)="setTemplate(s, $event)">
                        <option [ngValue]="undefined">Sin plantilla</option>
                        @for (t of waTemplates(); track t._id) { <option [value]="t.name">{{ t.name }} ({{ t.language }})</option> }
                      </select></div>
                    @if (s.template) {
                      <div><label [for]="'tv' + i">Variables, separadas por "|"</label>
                        <input [id]="'tv' + i" class="input" [name]="'tv' + i" [ngModel]="(s.template.variables || []).join('|')" (ngModelChange)="s.template!.variables = splitVars($event)" placeholder="{primer_nombre}" /></div>
                    }
                  }
                  @case ('email') {
                    <div class="full"><label [for]="'sj' + i">Asunto</label><input [id]="'sj' + i" class="input" [name]="'sj' + i" [(ngModel)]="s.subject" /></div>
                    <div class="full"><label [for]="'eb' + i">Texto</label><textarea [id]="'eb' + i" class="textarea" rows="4" [name]="'eb' + i" [(ngModel)]="s.text"></textarea></div>
                  }
                  @case ('sms') {
                    <div class="full"><label [for]="'sm' + i">SMS</label><textarea [id]="'sm' + i" class="textarea" rows="2" maxlength="480" [name]="'sm' + i" [(ngModel)]="s.text"></textarea></div>
                  }
                  @case ('tag') { <div><label [for]="'tg' + i">Etiqueta</label><input [id]="'tg' + i" class="input" [name]="'tg' + i" [(ngModel)]="s.tag" /></div> }
                  @case ('untag') { <div><label [for]="'ut' + i">Etiqueta</label><input [id]="'ut' + i" class="input" [name]="'ut' + i" [(ngModel)]="s.tag" /></div> }
                  @case ('stage') {
                    <div><label [for]="'st' + i">Etapa</label>
                      <select [id]="'st' + i" class="select" [name]="'st' + i" [(ngModel)]="s.stage">
                        @for (st of stages(); track st.key) { <option [value]="st.key">{{ st.label }}</option> }
                      </select></div>
                  }
                  @case ('assign') {
                    <div><label [for]="'as' + i">Responsable</label>
                      <select [id]="'as' + i" class="select" [name]="'as' + i" [(ngModel)]="s.userId">
                        @for (u of owners(); track u._id) { <option [value]="u._id">{{ u.name }}</option> }
                      </select></div>
                  }
                  @case ('reminder') {
                    <div><label [for]="'rt' + i">Recordatorio</label><input [id]="'rt' + i" class="input" [name]="'rt' + i" [(ngModel)]="s.title" placeholder="Llamar a {nombre}" /></div>
                    <div><label [for]="'rd' + i">Vence en (minutos)</label><input [id]="'rd' + i" class="input" type="number" min="0" [name]="'rd' + i" [(ngModel)]="s.dueMinutes" /></div>
                  }
                  @case ('webhook') {
                    <div class="full"><label [for]="'wu' + i">URL (https)</label><input [id]="'wu' + i" class="input" type="url" [name]="'wurl' + i" [(ngModel)]="s.url" placeholder="https://…" /></div>
                  }
                  @case ('condition') {
                    <div><label [for]="'cd' + i">Si…</label>
                      <select [id]="'cd' + i" class="select" [name]="'cd' + i" [(ngModel)]="s.condition">
                        <option value="replied">Respondió</option><option value="not_replied">No respondió</option>
                        <option value="has_tag">Tiene la etiqueta</option><option value="lacks_tag">No tiene la etiqueta</option>
                        <option value="score_at_least">Su puntaje es al menos</option>
                      </select></div>
                    @if (s.condition === 'score_at_least') {
                      <div><label [for]="'cs' + i">Puntaje mínimo</label><input [id]="'cs' + i" class="input" type="number" min="1" max="100" [name]="'cs' + i" [(ngModel)]="s.minScore" /></div>
                    }
                    @if (s.condition === 'has_tag' || s.condition === 'lacks_tag') {
                      <div><label [for]="'ct' + i">Etiqueta</label><input [id]="'ct' + i" class="input" [name]="'ct' + i" [(ngModel)]="s.tag" /></div>
                    }
                    <div><label [for]="'co' + i">Si no se cumple</label>
                      <select [id]="'co' + i" class="select" [name]="'co' + i" [(ngModel)]="s.otherwise">
                        <option value="exit">Sale de la secuencia</option><option value="skip_next">Salta el siguiente paso</option>
                      </select></div>
                  }
                }
              </div>
            </li>
          }
        </ol>
        <div class="add-step">
          <label for="add-step" class="sr-only">Añadir paso</label>
          <select id="add-step" class="select" name="addStep" [ngModel]="''" (ngModelChange)="addStep($event)">
            <option value="" disabled>+ Añadir paso…</option>
            @for (t of stepTypes; track t) { <option [value]="t">{{ stepLabel[t] }}</option> }
          </select>
        </div>

        <div class="card block">
          <h3>Reglas de salida y horario</h3>
          <label class="check"><input type="checkbox" name="exitOnReply" [(ngModel)]="e.exitOnReply" /> Sale de la secuencia si el contacto responde</label>
          <p class="muted small">Quien está en "No contactar" nunca recibe envíos y sale.</p>
          <label class="check"><input type="checkbox" name="useWindow" [(ngModel)]="e.useWindow" /> Enviar solo en horario (hora de Lima)</label>
          @if (e.useWindow) {
            <div class="grid">
              <div><label for="win-from">Desde</label><input id="win-from" class="input" type="number" min="0" max="23" name="from" [(ngModel)]="e.from" /></div>
              <div><label for="win-to">Hasta</label><input id="win-to" class="input" type="number" min="1" max="24" name="to" [(ngModel)]="e.to" /></div>
            </div>
          }
        </div>

        @if (detail(); as d) {
          @if (d.webhookSecret && hasWebhook(e)) {
            <div class="card block">
              <h3>Firma del webhook</h3>
              <p class="muted small">Cada llamada lleva <code>X-Maya-Timestamp</code> y <code>X-Maya-Signature</code> = HMAC SHA-256 de "timestamp.cuerpo" con este secreto:</p>
              <code class="secret">{{ d.webhookSecret }}</code>
            </div>
          }
          @if (d.recent?.length) {
            <div class="card block">
              <h3>Últimos contactos</h3>
              <ul class="runs">
                @for (r of d.recent; track r._id) {
                  <li>
                    <span>{{ r.customerId?.name || 'Contacto' }}</span>
                    <span class="muted small">{{ runLabel(r) }} · {{ r.updatedAt | date: 'd MMM, HH:mm' }}</span>
                    @if (r.status === 'active') {
                      <button type="button" class="btn btn-ghost btn-sm" (click)="exitRun(r._id)"><lucide-icon [img]="LogOut" [size]="14" /> Sacar</button>
                    }
                  </li>
                }
              </ul>
            </div>
          }
        }
      </app-form-page>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
    h1 { font-family: var(--font-heading); margin: 0 0 4px; }
    h3 { margin: 0 0 12px; font-size: 16px; }
    .muted { color: var(--color-text-muted); margin: 0; }
    .small { font-size: 13px; }
    .tpls { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .tpl { padding: 20px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .tpl p { flex: 1; }
    .empty { padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--color-text-muted); }
    .list { display: flex; flex-direction: column; gap: 12px; }
    .item { padding: 20px 24px; display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; }
    .title-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .link { background: none; border: none; padding: 0; font: inherit; font-weight: 600; font-size: 16px; color: var(--color-text-main); cursor: pointer; text-align: left; }
    .link:hover { color: var(--color-brand); }
    .stats { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; font-size: 13px; color: var(--color-text-muted); }
    .stats strong { color: var(--color-text-main); }
    .item-actions { display: flex; gap: 8px; }
    .block { padding: 24px; margin-bottom: 16px; }
    label { display: block; font-size: 13px; font-weight: 600; color: var(--color-text-muted); margin: 12px 0 6px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0 16px; }
    .full { grid-column: 1 / -1; }
    .inline { display: flex; gap: 8px; }
    .steps { list-style: none; padding: 0; margin: 0 0 12px; display: flex; flex-direction: column; gap: 12px; }
    .step { padding: 16px 20px; border-left: 4px solid var(--color-brand); }
    .step-head { display: flex; align-items: center; gap: 8px; }
    .step-n { width: 24px; height: 24px; border-radius: var(--radius-pill); background: var(--color-brand); color: var(--color-white); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex: none; }
    .select-sm { max-width: 220px; }
    .grow { flex: 1; }
    .add-step { margin-bottom: 20px; max-width: 320px; }
    .check { display: flex; align-items: center; gap: 8px; color: var(--color-text-main); font-weight: 500; margin: 8px 0; }
    .secret { display: block; word-break: break-all; padding: 12px; background: var(--color-bg-light); border-radius: var(--radius-md); font-size: 13px; }
    .runs { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .runs li { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (max-width: 640px) { .page { padding: 20px 16px; } .item { padding: 16px; } }
  `],
})
export class AutomationsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private api = `${environment.apiUrl}/automations`;

  readonly Workflow = Workflow; readonly Plus = Plus; readonly Trash2 = Trash2; readonly ArrowUp = ArrowUp;
  readonly ArrowDown = ArrowDown; readonly Play = Play; readonly Pause = Pause; readonly Copy = Copy; readonly LogOut = LogOut;
  readonly triggerLabel = TRIGGER_LABEL;
  readonly stepLabel = STEP_LABEL;
  readonly triggerTypes = Object.keys(TRIGGER_LABEL) as TriggerType[];
  readonly stepTypes = Object.keys(STEP_LABEL) as StepType[];
  readonly stepIcon: Record<StepType, typeof Clock> = {
    wait: Clock, whatsapp: MessageCircle, email: Mail, sms: MessageSquare, tag: Tag, untag: Tag, stage: Target,
    assign: UserCheck, reminder: Bell, webhook: Webhook, condition: GitBranch,
  };

  items = signal<Automation[]>([]);
  templates = signal<Template[]>([]);
  loading = signal(true);
  busy = signal(false);
  editing = signal<Editing | null>(null);
  detail = signal<Automation | null>(null);
  forms = signal<{ _id: string; name: string }[]>([]);
  stages = signal<{ key: string; label: string }[]>([]);
  events = signal<{ _id: string; title: string }[]>([]);
  owners = signal<{ _id: string; name: string }[]>([]);
  emailCampaigns = signal<{ _id: string; name: string }[]>([]);
  waTemplates = signal<{ _id: string; name: string; language: string; status: string }[]>([]);
  private initial = '';
  private refsLoaded = false;

  ngOnInit() {
    this.load();
    this.http.get<Template[]>(`${this.api}/templates`).subscribe({ next: t => this.templates.set(t), error: () => undefined });
  }

  load() {
    this.http.get<Automation[]>(this.api).subscribe({
      next: r => { this.items.set(r); this.loading.set(false); },
      error: err => { this.loading.set(false); this.toast.error(err.error?.message || 'No se pudieron cargar las automatizaciones'); },
    });
  }

  /** Formularios, etapas, eventos, responsables y plantillas: solo al abrir el editor. */
  private loadRefs() {
    if (this.refsLoaded) return;
    this.refsLoaded = true;
    const base = environment.apiUrl;
    const quiet = { error: () => undefined };
    this.http.get<{ _id: string; name: string }[]>(`${base}/forms`).subscribe({ next: r => this.forms.set(r), ...quiet });
    this.http.get<{ key: string; label: string }[]>(`${base}/leads/stages`).subscribe({ next: r => this.stages.set(r), ...quiet });
    this.http.get<{ _id: string; title: string }[]>(`${base}/events`).subscribe({ next: r => this.events.set(Array.isArray(r) ? r : []), ...quiet });
    this.http.get<{ _id: string; name: string }[]>(`${base}/leads/owners`).subscribe({ next: r => this.owners.set(r), ...quiet });
    this.http.get<{ _id: string; name: string; type: string }[]>(`${base}/campaigns`).subscribe({
      next: r => this.emailCampaigns.set((Array.isArray(r) ? r : []).filter(c => c.type === 'email')), ...quiet,
    });
    this.http.get<{ _id: string; name: string; language: string; status: string }[]>(`${base}/whatsapp-templates`).subscribe({
      next: r => this.waTemplates.set(r.filter(t => t.status === 'APPROVED')), ...quiet,
    });
  }

  triggerText(t: Trigger): string {
    const base = TRIGGER_LABEL[t.type];
    if (t.type === 'tag_added' && t.tag) return `${base}: ${t.tag}`;
    if (t.type === 'stage_changed' && t.stage) return `${base}: ${t.stage}`;
    if (t.type === 'no_reply' && t.hours) return `${base}: ${t.hours} h`;
    if (t.type === 'date_field' && t.field) return `${base}: ${t.field}`;
    if (t.type === 'score_reached' && t.minScore) return `${base}: ${t.minScore}`;
    return base;
  }

  runLabel(r: { status: string; exitReason?: string; stepIndex: number }) {
    if (r.status === 'active') return `En el paso ${r.stepIndex + 1}`;
    if (r.status === 'completed') return 'Completó';
    return EXIT_LABEL[r.exitReason ?? ''] ?? 'Salió';
  }

  private toEditing(a?: Partial<Automation>): Editing {
    const steps = (a?.steps ?? []).map(s => ({ ...s, template: s.template ? { ...s.template, variables: [...(s.template.variables ?? [])] } : undefined }));
    const waitUnit: Record<number, 'min' | 'h' | 'd'> = {};
    steps.forEach((s, i) => {
      if (s.type !== 'wait' || !s.minutes) return;
      waitUnit[i] = s.minutes % 1440 === 0 ? 'd' : s.minutes % 60 === 0 ? 'h' : 'min';
    });
    return {
      _id: a?._id, name: a?.name ?? '', trigger: { ...(a?.trigger ?? { type: 'form_submitted' }) }, steps,
      exitOnReply: a?.exitOnReply ?? true, useWindow: !!a?.sendWindow, from: a?.sendWindow?.from ?? 8, to: a?.sendWindow?.to ?? 20, waitUnit,
    };
  }

  private open(e: Editing) {
    this.loadRefs();
    this.initial = JSON.stringify(e);
    this.editing.set(e);
  }
  isDirty() { return JSON.stringify(this.editing()) !== this.initial; }

  openNew() {
    this.detail.set(null);
    this.open(this.toEditing({ steps: [{ type: 'whatsapp', text: 'Hola {nombre}, gracias por escribirnos.' }] }));
  }

  openEdit(a: Automation) {
    this.detail.set(null);
    this.open(this.toEditing(a));
    this.http.get<Automation>(`${this.api}/${a._id}`).subscribe({ next: d => this.detail.set(d), error: () => undefined });
  }

  useTemplate(t: Template) {
    this.busy.set(true);
    this.http.post<Automation>(`${this.api}/templates/${t.key}`, {}).subscribe({
      next: a => {
        this.busy.set(false);
        this.toast.success('Plantilla copiada. Revísala y actívala.');
        this.load();
        this.openEdit({ ...a, stats: { entered: 0, active: 0, completed: 0, replied: 0, exited: 0 } });
      },
      error: err => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo copiar la plantilla'); },
    });
  }

  waitValue(e: Editing, i: number): number | null {
    const m = e.steps[i].minutes;
    if (!m) return null;
    const u = e.waitUnit[i] || 'h';
    return u === 'd' ? m / 1440 : u === 'h' ? m / 60 : m;
  }
  setWait(e: Editing, i: number, v: number | null) {
    const u = e.waitUnit[i] || 'h';
    const n = Number(v) || 0;
    e.steps[i].minutes = n ? Math.round(u === 'd' ? n * 1440 : u === 'h' ? n * 60 : n) : undefined;
  }
  setUnit(e: Editing, i: number, u: 'min' | 'h' | 'd') {
    const v = this.waitValue(e, i);
    e.waitUnit[i] = u;
    this.setWait(e, i, v);
  }
  setTemplate(s: Step, name: string | undefined) {
    if (!name) { s.template = undefined; return; }
    const t = this.waTemplates().find(x => x.name === name);
    s.template = { name, language: t?.language, variables: s.template?.variables ?? [] };
  }
  splitVars(v: string) { return v.split('|').map(x => x.trim()).filter(Boolean); }
  hasWebhook(e: Editing) { return e.steps.some(s => s.type === 'webhook'); }

  addStep(type: StepType) {
    const e = this.editing();
    if (!e || !type) return;
    const defaults: Partial<Step> = type === 'wait' ? { minutes: 60 } : type === 'condition' ? { condition: 'not_replied', otherwise: 'exit' } : {};
    e.steps.push({ type, ...defaults });
    if (type === 'wait') e.waitUnit[e.steps.length - 1] = 'h';
    this.editing.set({ ...e });
  }

  move(i: number, d: number) {
    const e = this.editing();
    if (!e) return;
    const j = i + d;
    [e.steps[i], e.steps[j]] = [e.steps[j], e.steps[i]];
    [e.waitUnit[i], e.waitUnit[j]] = [e.waitUnit[j], e.waitUnit[i]];
  }

  save() {
    const e = this.editing();
    if (!e) return;
    if (!e.name.trim()) { this.toast.error('Ponle un nombre a la automatización'); return; }
    if (!e.steps.length) { this.toast.error('Añade al menos un paso'); return; }
    const body = {
      name: e.name.trim(), trigger: e.trigger, steps: e.steps, exitOnReply: e.exitOnReply,
      sendWindow: e.useWindow ? { from: Number(e.from), to: Number(e.to) } : null,
    };
    this.busy.set(true);
    const req = e._id ? this.http.put<Automation>(`${this.api}/${e._id}`, body) : this.http.post<Automation>(this.api, body);
    req.subscribe({
      next: () => { this.busy.set(false); this.toast.success('Automatización guardada'); this.editing.set(null); this.load(); },
      error: err => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo guardar'); },
    });
  }

  toggle(a: Automation) {
    this.busy.set(true);
    this.http.patch<{ active: boolean }>(`${this.api}/${a._id}/active`, { active: !a.active }).subscribe({
      next: r => {
        this.busy.set(false);
        this.toast.success(r.active ? 'Automatización activada' : 'Automatización en pausa');
        this.items.update(list => list.map(x => x._id === a._id ? { ...x, active: r.active } : x));
      },
      error: err => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo cambiar el estado'); },
    });
  }

  async remove(a: Automation) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar automatización',
      message: `"${a.name}" deja de ejecutarse y ${a.stats.active} contactos en curso salen de la secuencia.`,
      confirmText: 'Eliminar', danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.http.delete(`${this.api}/${a._id}`).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Automatización eliminada'); this.load(); },
      error: err => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo eliminar'); },
    });
  }

  async exitRun(runId: string) {
    const ok = await this.confirm.confirm({ title: 'Sacar de la secuencia', message: 'El contacto no recibirá los pasos que faltan.', confirmText: 'Sacar' });
    if (!ok) return;
    this.http.post(`${this.api}/runs/${runId}/exit`, {}).subscribe({
      next: () => {
        this.toast.success('Contacto fuera de la secuencia');
        const id = this.editing()?._id;
        if (id) this.http.get<Automation>(`${this.api}/${id}`).subscribe({ next: d => this.detail.set(d), error: () => undefined });
      },
      error: err => this.toast.error(err.error?.message || 'No se pudo sacar'),
    });
  }
}
