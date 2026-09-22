import { Component, DestroyRef, EventEmitter, HostListener, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideAngularModule, X, Globe, Phone, Mail, MapPin, Star, Search, Sparkles, UserPlus, Target,
  CheckCircle2, CircleSlash, AlertTriangle, Loader2, Copy, Printer, ExternalLink, Linkedin, Save,
  RefreshCw, FileText, Trash2, ArrowRight,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { ProspectingApiService } from '../../core/api/prospecting-api.service';
import {
  PROSPECT_STATUSES, Prospect, ProspectStatus, isBusy, PageSpeedResult,
} from '../../shared/models/prospecting.model';
import { buildReportHtml } from './prospect-report';

type Tab = 'summary' | 'research' | 'material' | 'follow';

const NETWORK_LABEL: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok',
  youtube: 'YouTube', x: 'X / Twitter', whatsapp: 'WhatsApp',
};

@Component({
  selector: 'app-prospect-drawer',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="overlay" (click)="close()" role="dialog" aria-modal="true">
      <aside class="drawer" (click)="$event.stopPropagation()">
        @if (p(); as p) {
          <div class="drawer-header">
            <div class="title-group">
              <h2>{{ p.name }}</h2>
              <p class="subtitle">{{ subtitle(p) }}</p>
            </div>
            <div class="header-right">
              <span class="score" [attr.data-level]="level(p.fitScore)" title="Encaje con tus servicios">{{ p.fitScore }}</span>
              <button class="btn btn-ghost btn-icon" (click)="close()" aria-label="Cerrar">
                <lucide-icon [img]="X" [size]="20"></lucide-icon>
              </button>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn-sm btn-primary" (click)="research()" [disabled]="busy(p.research.state)">
              <lucide-icon [img]="busy(p.research.state) ? Loader2 : Search" [size]="14" [class.spin]="busy(p.research.state)"></lucide-icon>
              {{ busy(p.research.state) ? 'Investigando…' : p.research.state === 'done' ? 'Reinvestigar' : 'Investigar' }}
            </button>
            <button class="btn btn-sm btn-secondary" (click)="tab.set('material')" [disabled]="p.research.state !== 'done'">
              <lucide-icon [img]="Sparkles" [size]="14"></lucide-icon> Material
            </button>
            <button class="btn btn-sm btn-secondary" (click)="toCustomer()" [disabled]="working()">
              <lucide-icon [img]="UserPlus" [size]="14"></lucide-icon> {{ p.customerId ? 'Contacto creado' : 'Agregar a contactos' }}
            </button>
            @if (p.leadId) {
              <button class="btn btn-sm btn-secondary" (click)="openLead()">
                <lucide-icon [img]="ArrowRight" [size]="14"></lucide-icon> Ver seguimiento
              </button>
            } @else {
              <button class="btn btn-sm btn-secondary" (click)="tab.set('follow')">
                <lucide-icon [img]="Target" [size]="14"></lucide-icon> Crear seguimiento
              </button>
            }
          </div>

          <div class="status-row">
            @for (s of statuses; track s.key) {
              <button class="chip" [class.active]="p.status === s.key" (click)="setStatus(s.key)">{{ s.label }}</button>
            }
          </div>

          <div class="tabs" role="tablist">
            @for (t of tabs; track t.key) {
              <button class="tab" role="tab" [class.active]="tab() === t.key" (click)="tab.set(t.key)">
                {{ t.label }}
                @if (t.key === 'research' && busy(p.research.state)) { <span class="dot-live"></span> }
                @if (t.key === 'material' && busy(p.material.state)) { <span class="dot-live"></span> }
              </button>
            }
          </div>

          <div class="drawer-scroll">
            @switch (tab()) {
              <!-- ───── Resumen ───── -->
              @case ('summary') {
                <div class="facts">
                  <div class="fact"><span class="fact-label">Web</span>
                    @if (p.website) { <a [href]="p.website" target="_blank" rel="noopener">{{ p.domain || p.website }}</a> } @else { <strong>—</strong> }
                  </div>
                  <div class="fact"><span class="fact-label">Teléfono</span><strong>{{ p.phone || '—' }}</strong></div>
                  <div class="fact"><span class="fact-label">Email</span><strong class="wrap">{{ p.email || '—' }}</strong></div>
                  <div class="fact"><span class="fact-label">Google Maps</span>
                    @if (p.mapsUrl) {
                      <a [href]="p.mapsUrl" target="_blank" rel="noopener">{{ p.rating ?? '—' }}★ · {{ p.reviewsCount ?? 0 }} reseñas</a>
                    } @else { <strong>{{ p.rating ? p.rating + '★' : '—' }}</strong> }
                  </div>
                  <div class="fact"><span class="fact-label">Origen</span><strong>{{ sourceLabel(p.source) }}</strong></div>
                  <div class="fact"><span class="fact-label">Madurez digital</span><strong>{{ p.research.ai?.digitalMaturity ?? '—' }}{{ p.research.ai?.digitalMaturity !== undefined ? '/100' : '' }}</strong></div>
                </div>

                @if (p.fitReason || p.research.ai?.fitReason) {
                  <div class="callout">
                    <strong>Por qué encaja</strong>
                    <p>{{ p.research.ai?.fitReason || p.fitReason }}</p>
                  </div>
                }

                @if (p.research.ai; as ai) {
                  @if (ai.summary) { <section><h3>Qué hace</h3><p>{{ ai.summary }}</p></section> }
                  <div class="facts">
                    @if (ai.sizeEstimate) { <div class="fact"><span class="fact-label">Tamaño</span><strong>{{ ai.sizeEstimate }}</strong></div> }
                    @if (ai.decisionMakers) { <div class="fact"><span class="fact-label">Quién decide</span><strong>{{ ai.decisionMakers }}</strong></div> }
                  </div>
                  @if (ai.approach) { <div class="callout ai"><strong>Cómo abordarlos</strong><p>{{ ai.approach }}</p></div> }
                  <div class="grid-2">
                    @if (ai.painPoints?.length) { <section><h3>Problemas probables</h3><ul>@for (x of ai.painPoints; track $index) { <li>{{ x }}</li> }</ul></section> }
                    @if (ai.opportunities?.length) { <section><h3>Oportunidades</h3><ul>@for (x of ai.opportunities; track $index) { <li>{{ x }}</li> }</ul></section> }
                    @if (ai.strengths?.length) { <section><h3>Fortalezas</h3><ul>@for (x of ai.strengths; track $index) { <li>{{ x }}</li> }</ul></section> }
                    @if (ai.weaknesses?.length) { <section><h3>Debilidades</h3><ul>@for (x of ai.weaknesses; track $index) { <li>{{ x }}</li> }</ul></section> }
                  </div>
                  @if (ai.talkingPoints?.length) { <section><h3>Temas para abrir conversación</h3><ul>@for (x of ai.talkingPoints; track $index) { <li>{{ x }}</li> }</ul></section> }
                  @if (ai.risks?.length) { <section><h3>Riesgos y objeciones</h3><ul>@for (x of ai.risks; track $index) { <li>{{ x }}</li> }</ul></section> }
                } @else {
                  @if (p.description) { <p class="text">{{ p.description }}</p> }
                  <div class="empty">
                    <lucide-icon [img]="Search" [size]="28"></lucide-icon>
                    <p>Investiga la empresa para ver su análisis: web, velocidad, redes, reseñas y las personas detrás.</p>
                  </div>
                }
              }

              <!-- ───── Investigación ───── -->
              @case ('research') {
                @if (p.research.state === 'idle') {
                  <div class="empty">
                    <lucide-icon [img]="Search" [size]="28"></lucide-icon>
                    <p>Aún no se ha investigado esta empresa.</p>
                    <button class="btn btn-primary" (click)="research()"><lucide-icon [img]="Search" [size]="16"></lucide-icon> Investigar ahora</button>
                  </div>
                }
                @if (p.research.state === 'failed') {
                  <div class="alert alert-danger"><lucide-icon [img]="AlertTriangle" [size]="16"></lucide-icon> {{ p.research.error || 'La investigación falló' }}</div>
                }
                @if (p.research.steps?.length || busy(p.research.state)) {
                  <section>
                    <h3>Fuentes consultadas</h3>
                    <ul class="steps">
                      @for (s of p.research.steps ?? []; track s.key) {
                        <li [attr.data-status]="s.status">
                          <lucide-icon [img]="s.status === 'ok' ? CheckCircle2 : s.status === 'skipped' ? CircleSlash : AlertTriangle" [size]="16"></lucide-icon>
                          <span class="step-label">{{ s.label }}</span>
                          <span class="step-detail">{{ s.detail }}</span>
                        </li>
                      }
                      @if (busy(p.research.state)) {
                        <li data-status="running"><lucide-icon [img]="Loader2" [size]="16" class="spin"></lucide-icon><span class="step-label">{{ p.research.state === 'queued' ? 'En cola…' : 'Investigando…' }}</span></li>
                      }
                    </ul>
                  </section>
                }

                @if (p.research.website; as w) {
                  <section>
                    <h3>Sitio web</h3>
                    <div class="checks">
                      @for (c of webChecks(); track c.label) {
                        <span class="check" [class.ok]="c.ok"><lucide-icon [img]="c.ok ? CheckCircle2 : CircleSlash" [size]="14"></lucide-icon>{{ c.label }}</span>
                      }
                    </div>
                    @if (w.title) { <p class="text"><strong>{{ w.title }}</strong>@if (w.description) { — {{ w.description }} }</p> }
                    @if (w.technologies.length) {
                      <div class="tags">@for (t of w.technologies; track t) { <span class="tag">{{ t }}</span> }</div>
                    }
                  </section>
                }

                @if (p.research.pageSpeed; as ps) {
                  <section>
                    <h3>Velocidad y calidad (PageSpeed)</h3>
                    <div class="ps-grid">
                      @for (r of psResults(); track r.strategy) {
                        <div class="ps-card">
                          <span class="ps-title">{{ r.strategy === 'mobile' ? 'Móvil' : 'Escritorio' }}</span>
                          <div class="gauges">
                            @for (g of gauges(r); track g.label) {
                              <div class="gauge" [attr.data-level]="level(g.value ?? 0)">
                                <strong>{{ g.value ?? '—' }}</strong><span>{{ g.label }}</span>
                              </div>
                            }
                          </div>
                          <div class="metrics">@for (m of metricList(r); track m[0]) { <span>{{ m[0] }} <b>{{ m[1] }}</b></span> }</div>
                        </div>
                      }
                    </div>
                    @if (ps.mobile?.opportunities?.length) {
                      <ul class="small">@for (o of ps.mobile?.opportunities; track o.title) { <li>{{ o.title }} @if (o.savings) { <span class="muted">({{ o.savings }})</span> }</li> }</ul>
                    }
                  </section>
                }

                @if (p.research.place; as place) {
                  <section>
                    <h3>Google Maps</h3>
                    <p class="text">{{ place.rating ?? '—' }}★ · {{ place.reviewsCount ?? 0 }} reseñas @if (place.summary) { · {{ place.summary }} }</p>
                    @if (p.research.ai?.reviewsInsight) { <div class="callout"><p>{{ p.research.ai?.reviewsInsight }}</p></div> }
                    @for (r of place.reviews ?? []; track $index) {
                      <blockquote><span class="stars">{{ r.rating }}★</span> {{ r.text }} <span class="muted">{{ r.when }}</span></blockquote>
                    }
                  </section>
                }

                @if (p.research.social?.length || p.research.ai?.socialPresence) {
                  <section>
                    <h3>Redes sociales</h3>
                    @if (p.research.ai?.socialPresence) { <p class="text">{{ p.research.ai?.socialPresence }}</p> }
                    <div class="links">
                      @for (s of p.research.social ?? []; track s.url) {
                        <a class="link-chip" [href]="s.url" target="_blank" rel="noopener"><lucide-icon [img]="ExternalLink" [size]="12"></lucide-icon>{{ networkLabel(s.network) }}</a>
                      }
                    </div>
                  </section>
                }

                @if (p.research.emails?.length || p.research.phones?.length) {
                  <section>
                    <h3>Datos de contacto encontrados</h3>
                    <div class="tags">
                      @for (e of p.research.emails ?? []; track e) { <span class="tag"><lucide-icon [img]="Mail" [size]="12"></lucide-icon>{{ e }}</span> }
                      @for (ph of p.research.phones ?? []; track ph) { <span class="tag"><lucide-icon [img]="Phone" [size]="12"></lucide-icon>{{ ph }}</span> }
                    </div>
                  </section>
                }

                @if (p.research.people?.length) {
                  <section>
                    <h3>Personas detrás de la empresa</h3>
                    <ul class="people">
                      @for (person of p.research.people; track $index; let i = $index) {
                        <li>
                          <div class="person-info">
                            <strong>{{ person.name }}</strong>
                            <span class="muted">{{ person.role || 'Cargo desconocido' }} · {{ person.source }}</span>
                            @if (person.email) { <span class="wrap">{{ person.email }}</span> }
                            @if (person.notes) { <span class="muted">{{ person.notes }}</span> }
                          </div>
                          <div class="person-actions">
                            @if (person.linkedin) {
                              <a class="btn btn-icon btn-ghost btn-sm" [href]="person.linkedin" target="_blank" rel="noopener" aria-label="LinkedIn"><lucide-icon [img]="Linkedin" [size]="15"></lucide-icon></a>
                            }
                            <button class="btn btn-sm btn-secondary" (click)="toCustomer(i)" [disabled]="working() || !!person.customerId">
                              <lucide-icon [img]="person.customerId ? CheckCircle2 : UserPlus" [size]="14"></lucide-icon>
                              {{ person.customerId ? 'En contactos' : 'Contacto' }}
                            </button>
                          </div>
                        </li>
                      }
                    </ul>
                  </section>
                }

                @if (p.research.searchResults?.length) {
                  <section>
                    <h3>En Google</h3>
                    <ul class="results">
                      @for (r of p.research.searchResults; track r.link) {
                        <li><a [href]="r.link" target="_blank" rel="noopener">{{ r.title }}</a><span class="muted">{{ r.snippet }}</span></li>
                      }
                    </ul>
                  </section>
                }
              }

              <!-- ───── Material ───── -->
              @case ('material') {
                @if (p.research.state !== 'done') {
                  <div class="empty"><lucide-icon [img]="Sparkles" [size]="28"></lucide-icon><p>El material se construye con la investigación. Investiga la empresa primero.</p></div>
                } @else if (busy(p.material.state)) {
                  <div class="empty"><lucide-icon [img]="Loader2" [size]="28" class="spin"></lucide-icon><p>Preparando el diagnóstico, el plan y los mensajes… suele tardar uno o dos minutos.</p></div>
                } @else {
                  @if (p.material.state === 'failed') {
                    <div class="alert alert-danger"><lucide-icon [img]="AlertTriangle" [size]="16"></lucide-icon> {{ p.material.error || 'No se pudo generar el material' }}</div>
                  }
                  @if (p.material.state !== 'done') {
                    <div class="intro-card">
                      <h3 class="intro-title">Material que acerca al cliente</h3>
                      <p class="text">Un diagnóstico completo de su presencia digital, un plan de mejora con ideas extra y los mensajes para abrir la conversación (correo, WhatsApp, LinkedIn y llamada).</p>
                      <label class="label" for="instr">Indicaciones (opcional)</label>
                      <textarea id="instr" class="textarea" rows="3" [(ngModel)]="instructions" placeholder="Ej. enfócate en ventas por WhatsApp; tono formal; menciona nuestro caso con una clínica similar"></textarea>
                      <button class="btn btn-primary" (click)="generate()" [disabled]="working()"><lucide-icon [img]="Sparkles" [size]="16"></lucide-icon> Generar material</button>
                    </div>
                  } @else {
                    <div class="material-bar">
                      <button class="btn btn-sm btn-primary" (click)="printReport()"><lucide-icon [img]="Printer" [size]="14"></lucide-icon> Informe PDF</button>
                      <button class="btn btn-sm btn-ghost" (click)="regenerate()"><lucide-icon [img]="RefreshCw" [size]="14"></lucide-icon> Regenerar</button>
                    </div>

                    @if (p.material.diagnosis; as d) {
                      <div class="diag-head">
                        <span class="big-score" [attr.data-level]="level(d.score ?? 0)">{{ d.score ?? '—' }}</span>
                        <div><strong class="headline">{{ d.headline }}</strong><p class="text">{{ d.summary }}</p></div>
                      </div>
                      @for (a of d.areas ?? []; track a.area) {
                        <div class="area" [attr.data-status]="a.status">
                          <div class="area-head"><strong>{{ a.area }}</strong><span class="area-score">{{ a.score ?? '—' }}/100</span></div>
                          <div class="grid-2">
                            <div><h4>Hallazgos</h4><ul>@for (x of a.findings ?? []; track $index) { <li>{{ x }}</li> }</ul></div>
                            <div><h4>Recomendaciones</h4><ul>@for (x of a.recommendations ?? []; track $index) { <li>{{ x }}</li> }</ul></div>
                          </div>
                        </div>
                      }
                    }

                    @if (p.material.plan; as plan) {
                      <section>
                        <h3>Plan de mejora</h3>
                        @if (plan.vision) { <p class="text">{{ plan.vision }}</p> }
                        @if (plan.quickWins?.length) { <h4>Mejoras rápidas</h4><ul>@for (x of plan.quickWins; track $index) { <li>{{ x }}</li> }</ul> }
                        @for (i of plan.initiatives ?? []; track $index) {
                          <div class="initiative">
                            <strong>{{ i.title }}</strong>
                            <span class="muted">Impacto {{ i.impact }} · Esfuerzo {{ i.effort }} · {{ i.timeline }}</span>
                            <p class="text">{{ i.description }}</p>
                          </div>
                        }
                        @if (plan.suggestedServices?.length) {
                          <h4>Servicios a proponer</h4>
                          <ul>@for (s of plan.suggestedServices; track $index) { <li><strong>{{ s.service }}</strong>: {{ s.why }} @if (s.outcome) { <span class="muted">— {{ s.outcome }}</span> }</li> }</ul>
                        }
                        @if (plan.kpis?.length) { <h4>KPIs</h4><ul>@for (x of plan.kpis; track $index) { <li>{{ x }}</li> }</ul> }
                        @if (plan.extraIdeas?.length) { <h4>Ideas extra</h4><ul>@for (x of plan.extraIdeas; track $index) { <li>{{ x }}</li> }</ul> }
                      </section>
                    }

                    @if (p.material.outreach; as o) {
                      <section>
                        <h3>Mensajes para el primer contacto</h3>
                        @for (m of outreachBlocks(); track m.label) {
                          <div class="msg">
                            <div class="msg-head">
                              <span class="label">{{ m.label }}</span>
                              <div class="msg-actions">
                                @if (m.href) { <a class="btn btn-icon btn-ghost btn-sm" [href]="m.href" target="_blank" rel="noopener" [attr.aria-label]="'Abrir ' + m.label"><lucide-icon [img]="ExternalLink" [size]="14"></lucide-icon></a> }
                                <button class="btn btn-icon btn-ghost btn-sm" (click)="copy(m.text)" aria-label="Copiar"><lucide-icon [img]="Copy" [size]="14"></lucide-icon></button>
                              </div>
                            </div>
                            <p class="msg-text">{{ m.text }}</p>
                          </div>
                        }
                      </section>
                    }
                  }
                }
              }

              <!-- ───── Seguimiento ───── -->
              @case ('follow') {
                <section>
                  <h3>Notas</h3>
                  <textarea class="textarea" rows="5" [(ngModel)]="notes" placeholder="Llamadas, acuerdos, próximos pasos…"></textarea>
                  <div class="row-end">
                    <button class="btn btn-sm btn-secondary" (click)="saveNotes()" [disabled]="working()"><lucide-icon [img]="Save" [size]="14"></lucide-icon> Guardar notas</button>
                  </div>
                </section>

                <section>
                  <h3>Contacto</h3>
                  @if (p.customerId) {
                    <p class="text">Ya está en tus contactos.</p>
                    <button class="btn btn-sm btn-secondary" (click)="openCustomers()"><lucide-icon [img]="ArrowRight" [size]="14"></lucide-icon> Ir a contactos</button>
                  } @else {
                    <p class="text">Guarda la empresa en tus contactos con los datos encontrados. Para una persona concreta, usa la pestaña Investigación.</p>
                    <button class="btn btn-sm btn-primary" (click)="toCustomer()" [disabled]="working()"><lucide-icon [img]="UserPlus" [size]="14"></lucide-icon> Agregar a contactos</button>
                  }
                </section>

                <section>
                  <h3>Seguimiento comercial</h3>
                  @if (p.leadId) {
                    <p class="text">Esta empresa ya tiene una oportunidad en el embudo de seguimiento.</p>
                    <button class="btn btn-sm btn-primary" (click)="openLead()"><lucide-icon [img]="ArrowRight" [size]="14"></lucide-icon> Ver seguimiento</button>
                  } @else {
                    <div class="form">
                      <div class="field">
                        <label class="label" for="lt">Título de la oportunidad</label>
                        <input id="lt" class="input" [(ngModel)]="leadTitle" [placeholder]="p.name" />
                      </div>
                      <div class="field">
                        <label class="label" for="lv">Valor estimado</label>
                        <input id="lv" class="input" type="number" min="0" [(ngModel)]="leadValue" placeholder="0" />
                      </div>
                      @if (p.research.people?.length) {
                        <div class="field">
                          <label class="label" for="lp">Persona de contacto</label>
                          <select id="lp" class="select" [(ngModel)]="leadPerson">
                            <option [ngValue]="null">La empresa</option>
                            @for (person of p.research.people; track $index; let i = $index) {
                              <option [ngValue]="i">{{ person.name }}{{ person.role ? ' — ' + person.role : '' }}</option>
                            }
                          </select>
                        </div>
                      }
                      <p class="hint">Se crea el contacto (si no existe) y la oportunidad con el resumen, las oportunidades detectadas y los mensajes sugeridos como nota.</p>
                      <button class="btn btn-primary" (click)="toLead()" [disabled]="working()"><lucide-icon [img]="Target" [size]="16"></lucide-icon> Crear seguimiento</button>
                    </div>
                  }
                </section>

                <section class="danger-zone">
                  <button class="btn btn-sm btn-ghost danger" (click)="remove()"><lucide-icon [img]="Trash2" [size]="14"></lucide-icon> Eliminar prospecto</button>
                </section>
              }
            }
          </div>
        } @else {
          <div class="loading"><lucide-icon [img]="Loader2" [size]="28" class="spin"></lucide-icon></div>
        }
      </aside>
    </div>
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .drawer { margin-left: auto; height: 100%; width: min(680px, 100%); background: var(--color-white); display: flex; flex-direction: column; box-shadow: var(--shadow-lg); animation: slideIn var(--transition-spring); }
    @keyframes slideIn { from { transform: translateX(30px); opacity: 0; } to { transform: none; opacity: 1; } }
    .drawer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 24px 28px 12px; padding-top: calc(24px + var(--safe-top)); }
    .title-group { min-width: 0; }
    .title-group h2 { margin: 0 0 3px; font-family: var(--font-heading); font-size: 21px; overflow-wrap: anywhere; }
    .subtitle { margin: 0; font-size: 13px; color: var(--color-text-muted); }
    .header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .score, .big-score { display: inline-grid; place-items: center; min-width: 40px; height: 40px; border-radius: var(--radius-pill); font: 700 15px var(--font-heading); background: var(--color-bg-app); color: var(--color-text-muted); padding: 0 8px; box-sizing: border-box; }
    [data-level="high"] { --lvl: var(--color-success); }
    [data-level="mid"] { --lvl: var(--color-warning); }
    [data-level="low"] { --lvl: var(--color-error); }
    .score[data-level], .big-score[data-level] { color: var(--lvl); background: color-mix(in srgb, var(--lvl) 12%, transparent); }
    .big-score { min-width: 64px; height: 64px; font-size: 24px; flex-shrink: 0; }

    .actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 28px 12px; }
    .status-row { display: flex; gap: 6px; padding: 0 28px 12px; overflow-x: auto; scrollbar-width: none; }
    .chip { flex: 0 0 auto; border: 1.5px solid var(--color-border); background: var(--color-white); color: var(--color-text-muted); font: 600 12px var(--font-base); padding: 6px 12px; border-radius: var(--radius-pill); cursor: pointer; transition: all var(--transition-fast); }
    .chip:hover { border-color: var(--color-brand); color: var(--color-brand); }
    .chip.active { background: var(--color-brand); border-color: var(--color-brand); color: var(--color-white); }

    .tabs { display: flex; gap: 4px; padding: 0 28px; border-bottom: 1px solid var(--color-border); overflow-x: auto; scrollbar-width: none; }
    .tab { flex: 0 0 auto; background: none; border: none; border-bottom: 2px solid transparent; padding: 10px 12px; font: 600 13.5px var(--font-base); color: var(--color-text-muted); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .tab.active { color: var(--color-brand); border-bottom-color: var(--color-brand); }
    .dot-live { width: 7px; height: 7px; border-radius: 50%; background: var(--color-ai); animation: pulse 1.2s infinite; }
    @keyframes pulse { 50% { opacity: .3; } }

    .drawer-scroll { flex: 1; overflow-y: auto; padding: 20px 28px 32px; padding-bottom: calc(32px + var(--safe-bottom)); display: flex; flex-direction: column; gap: 20px; min-width: 0; }
    section { min-width: 0; }
    h3 { font: 600 15px var(--font-heading); margin: 0 0 8px; }
    h4 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--color-text-muted); margin: 12px 0 4px; }
    ul { margin: 0; padding-left: 18px; font-size: 13.5px; line-height: 1.55; }
    li { margin: 3px 0; overflow-wrap: anywhere; }
    .text { margin: 0; font-size: 13.5px; line-height: 1.6; overflow-wrap: anywhere; }
    .muted { color: var(--color-text-muted); font-size: 12.5px; }
    .wrap { overflow-wrap: anywhere; }
    .small { font-size: 12.5px; margin-top: 10px; }
    a { color: var(--color-brand); overflow-wrap: anywhere; }

    .facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .fact { background: var(--color-bg-light); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 13.5px; min-width: 0; }
    .fact-label { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-text-muted); margin-bottom: 2px; }
    .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .callout { background: var(--color-bg-light); border-radius: var(--radius-md); padding: 14px 18px; font-size: 13.5px; }
    .callout p { margin: 4px 0 0; line-height: 1.55; }
    .callout.ai { background: color-mix(in srgb, var(--color-ai) 8%, var(--color-white)); }
    .alert { display: flex; gap: 10px; align-items: flex-start; padding: 12px 16px; border-radius: var(--radius-md); font-size: 13px; }
    .alert-danger { background: color-mix(in srgb, var(--color-error) 8%, var(--color-white)); color: var(--color-error); }

    .empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 36px 16px; color: var(--color-text-muted); }
    .empty p { margin: 0; max-width: 380px; font-size: 14px; line-height: 1.55; }
    .loading { display: grid; place-items: center; flex: 1; color: var(--color-text-muted); }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .steps { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .steps li { display: grid; grid-template-columns: 18px auto 1fr; gap: 8px; align-items: center; font-size: 13px; }
    .steps li[data-status="ok"] { color: var(--color-success); }
    .steps li[data-status="skipped"] { color: var(--color-text-muted); }
    .steps li[data-status="failed"] { color: var(--color-error); }
    .steps li[data-status="running"] { color: var(--color-ai); }
    .step-label { font-weight: 600; color: var(--color-text-main); }
    .step-detail { color: var(--color-text-muted); font-size: 12.5px; overflow-wrap: anywhere; min-width: 0; }

    .checks { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .check { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--color-error) 8%, var(--color-white)); color: var(--color-error); }
    .check.ok { background: color-mix(in srgb, var(--color-success) 10%, var(--color-white)); color: var(--color-success); }
    .tags, .links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .tag, .link-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 5px 10px; border-radius: var(--radius-pill); background: var(--color-bg-app); border: 1px solid var(--color-border); max-width: 100%; overflow-wrap: anywhere; }
    .link-chip { text-decoration: none; font-weight: 600; }

    .ps-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .ps-card { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 14px; min-width: 0; }
    .ps-title { font: 600 13px var(--font-heading); }
    .gauges { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0; }
    .gauge { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 2px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--lvl, var(--color-border)) 12%, transparent); }
    .gauge strong { font: 700 17px var(--font-heading); color: var(--lvl, var(--color-text-muted)); }
    .gauge span { font-size: 10px; color: var(--color-text-muted); text-align: center; }
    .metrics { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11.5px; color: var(--color-text-muted); }
    .metrics b { color: var(--color-text-main); }
    blockquote { margin: 8px 0 0; padding: 10px 14px; background: var(--color-bg-light); border-radius: var(--radius-sm); font-size: 13px; line-height: 1.5; }
    .stars { font-weight: 700; color: var(--color-warning); }

    .people { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .people li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .person-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 13px; }
    .person-actions { display: flex; gap: 4px; flex-shrink: 0; }
    .results { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .results li { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }

    .intro-card, .form { display: flex; flex-direction: column; gap: 12px; padding: 20px; background: var(--color-bg-light); border-radius: var(--radius-lg); }
    .intro-title { margin: 0; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .hint { font-size: 12px; color: var(--color-text-muted); margin: 0; line-height: 1.5; }
    .material-bar { display: flex; gap: 8px; flex-wrap: wrap; }
    .diag-head { display: flex; gap: 16px; align-items: flex-start; }
    .headline { font: 600 16px var(--font-heading); display: block; margin-bottom: 4px; }
    .area { border: 1px solid var(--color-border); border-left: 4px solid var(--lvl, var(--color-border)); border-radius: var(--radius-md); padding: 14px 16px; }
    .area[data-status="good"] { --lvl: var(--color-success); }
    .area[data-status="warning"] { --lvl: var(--color-warning); }
    .area[data-status="critical"] { --lvl: var(--color-error); }
    .area-head { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }
    .area-score { font-weight: 700; color: var(--lvl); }
    .initiative { padding: 10px 0; border-bottom: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 2px; font-size: 13.5px; }
    .msg { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 12px 16px; margin-bottom: 10px; }
    .msg-head { display: flex; justify-content: space-between; align-items: center; }
    .msg-actions { display: flex; gap: 2px; }
    .msg-text { margin: 6px 0 0; white-space: pre-wrap; font-size: 13.5px; line-height: 1.55; overflow-wrap: anywhere; }
    .row-end { display: flex; justify-content: flex-end; margin-top: 8px; }
    .danger-zone { border-top: 1px solid var(--color-border); padding-top: 14px; }
    .danger { color: var(--color-error) !important; }

    @media (max-width: 768px) {
      .drawer-header, .actions, .status-row, .tabs, .drawer-scroll { padding-left: 16px; padding-right: 16px; }
      .facts, .grid-2, .ps-grid { grid-template-columns: 1fr; }
      .actions .btn { flex: 1 1 auto; justify-content: center; }
      .text, ul { font-size: 15px; }
    }
  `],
})
export class ProspectDrawerComponent implements OnInit {
  @Input({ required: true }) prospectId!: string;
  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<Prospect>();
  @Output() removed = new EventEmitter<string>();

  private api = inject(ProspectingApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly X = X; readonly Globe = Globe; readonly Phone = Phone; readonly Mail = Mail; readonly MapPin = MapPin;
  readonly Star = Star; readonly Search = Search; readonly Sparkles = Sparkles; readonly UserPlus = UserPlus;
  readonly Target = Target; readonly CheckCircle2 = CheckCircle2; readonly CircleSlash = CircleSlash;
  readonly AlertTriangle = AlertTriangle; readonly Loader2 = Loader2; readonly Copy = Copy; readonly Printer = Printer;
  readonly ExternalLink = ExternalLink; readonly Linkedin = Linkedin; readonly Save = Save; readonly RefreshCw = RefreshCw;
  readonly FileText = FileText; readonly Trash2 = Trash2; readonly ArrowRight = ArrowRight;

  readonly statuses = PROSPECT_STATUSES;
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Resumen' },
    { key: 'research', label: 'Investigación' },
    { key: 'material', label: 'Material' },
    { key: 'follow', label: 'Seguimiento' },
  ];

  p = signal<Prospect | null>(null);
  tab = signal<Tab>('summary');
  working = signal(false);
  instructions = '';
  notes = '';
  leadTitle = '';
  leadValue: number | null = null;
  leadPerson: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly busy = isBusy;

  webChecks = computed(() => {
    const w = this.p()?.research.website;
    if (!w) return [];
    return [
      { label: 'Web accesible', ok: w.reachable },
      { label: 'HTTPS', ok: w.https },
      { label: 'Adaptada a móvil', ok: w.hasViewport },
      { label: 'Meta descripción', ok: !!w.description },
      { label: 'Un H1', ok: w.h1Count === 1 },
      { label: 'Datos estructurados', ok: w.hasSchemaOrg },
      { label: 'Vista previa social', ok: w.hasOpenGraph },
      { label: 'Formulario de contacto', ok: w.hasContactForm },
      { label: 'Blog', ok: w.hasBlog },
      { label: 'Analítica', ok: w.technologies.some(t => /Analytics|Tag Manager|Pixel/.test(t)) },
      { label: `Actualizada ${w.copyrightYear ?? '—'}`, ok: !!w.copyrightYear && w.copyrightYear >= new Date().getFullYear() - 1 },
    ];
  });

  psResults = computed(() => {
    const ps = this.p()?.research.pageSpeed;
    return [ps?.mobile, ps?.desktop].filter((r): r is PageSpeedResult => !!r);
  });

  outreachBlocks = computed(() => {
    const p = this.p();
    const o = p?.material.outreach;
    if (!p || !o) return [];
    const phone = (p.phone || p.research.phones?.[0] || '').replace(/\D/g, '');
    const email = p.email || p.research.emails?.[0];
    const blocks: { label: string; text: string; href?: string }[] = [];
    if (o.email) blocks.push({
      label: `Correo — ${o.emailSubject ?? ''}`, text: o.email,
      href: email ? `mailto:${email}?subject=${encodeURIComponent(o.emailSubject ?? '')}&body=${encodeURIComponent(o.email)}` : undefined,
    });
    if (o.whatsapp) blocks.push({ label: 'WhatsApp', text: o.whatsapp, href: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(o.whatsapp)}` : undefined });
    if (o.linkedin) blocks.push({ label: 'LinkedIn', text: o.linkedin });
    if (o.callScript) blocks.push({ label: 'Guion de llamada', text: o.callScript });
    (o.followUps ?? []).forEach((f, i) => blocks.push({ label: `Seguimiento ${i + 1}`, text: f }));
    return blocks;
  });

  ngOnInit() {
    this.destroyRef.onDestroy(() => { if (this.timer) clearTimeout(this.timer); });
    this.load();
  }

  @HostListener('document:keydown.escape')
  close() { this.closed.emit(); }

  private load() {
    if (this.timer) clearTimeout(this.timer);
    this.api.prospect(this.prospectId).subscribe({
      next: (p) => this.apply(p),
      error: (err: { error?: { message?: string } }) => { this.toast.error(err.error?.message || 'No se pudo cargar el prospecto'); this.close(); },
    });
  }

  private apply(p: Prospect, notify = true) {
    const wasBusy = this.p() && (isBusy(this.p()!.research.state) || isBusy(this.p()!.material.state));
    this.p.set(p);
    if (!this.notes || !wasBusy) this.notes = p.notes ?? '';
    if (notify) this.changed.emit(p);
    // Investigación y material corren en segundo plano: se refresca mientras duren.
    if (isBusy(p.research.state) || isBusy(p.material.state))
      this.timer = setTimeout(() => this.load(), 4000);
    else if (wasBusy) {
      if (p.research.state === 'done' && this.tab() === 'research') this.toast.success('Investigación completada');
      if (p.material.state === 'done' && this.tab() === 'material') this.toast.success('Material listo');
    }
  }

  subtitle(p: Prospect) { return [p.industry, p.address].filter(Boolean).join(' · ') || 'Sin datos de ubicación'; }

  level(score: number) { return score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low'; }

  gauges(r: PageSpeedResult) {
    return [
      { label: 'Rendimiento', value: r.performance },
      { label: 'SEO', value: r.seo },
      { label: 'Accesib.', value: r.accessibility },
      { label: 'Prácticas', value: r.bestPractices },
    ];
  }

  metricList(r: PageSpeedResult) { return Object.entries(r.metrics ?? {}); }

  networkLabel(n: string) { return NETWORK_LABEL[n] ?? n; }

  sourceLabel(s: string) {
    return ({ google_places: 'Google Maps', serper: 'Google', ai: 'Sugerido por IA', manual: 'Manual' } as Record<string, string>)[s] ?? s;
  }

  research() {
    const p = this.p();
    if (!p) return;
    this.api.research([p._id]).subscribe({
      next: () => { this.toast.success('Investigación en marcha. Puedes cerrar la ficha: seguirá en segundo plano.'); this.tab.set('research'); this.load(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo iniciar la investigación'),
    });
  }

  generate() {
    const p = this.p();
    if (!p) return;
    this.working.set(true);
    this.api.material(p._id, this.instructions).subscribe({
      next: (res) => { this.working.set(false); this.toast.success('Generando material…'); this.apply(res); },
      error: (err: { error?: { message?: string } }) => { this.working.set(false); this.toast.error(err.error?.message || 'No se pudo generar el material'); },
    });
  }

  async regenerate() {
    const ok = await this.confirm.confirm({ title: 'Regenerar material', message: 'Se reemplazará el diagnóstico, el plan y los mensajes actuales.', confirmText: 'Regenerar' });
    if (!ok) return;
    this.instructions = this.p()?.material.instructions ?? '';
    this.generate();
  }

  printReport() {
    const p = this.p();
    if (!p) return;
    const win = window.open('', '_blank');
    if (!win) { this.toast.error('Permite las ventanas emergentes para descargar el informe'); return; }
    win.document.write(buildReportHtml(p));
    win.document.close();
  }

  async copy(text: string) {
    try { await navigator.clipboard.writeText(text); this.toast.success('Copiado'); }
    catch { this.toast.error('No se pudo copiar'); }
  }

  setStatus(status: ProspectStatus) {
    const p = this.p();
    if (!p || p.status === status) return;
    this.api.updateProspect(p._id, { status }).subscribe({
      next: (res) => { this.apply({ ...p, status: res.status }); this.toast.success('Estado actualizado'); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo actualizar'),
    });
  }

  saveNotes() {
    const p = this.p();
    if (!p) return;
    this.working.set(true);
    this.api.updateProspect(p._id, { notes: this.notes }).subscribe({
      next: () => { this.working.set(false); this.apply({ ...p, notes: this.notes }); this.toast.success('Notas guardadas'); },
      error: (err: { error?: { message?: string } }) => { this.working.set(false); this.toast.error(err.error?.message || 'No se pudieron guardar las notas'); },
    });
  }

  toCustomer(personIndex?: number) {
    const p = this.p();
    if (!p) return;
    if (personIndex === undefined && p.customerId) { this.openCustomers(); return; }
    this.working.set(true);
    this.api.toCustomer(p._id, personIndex).subscribe({
      next: (res) => { this.working.set(false); this.apply(res.prospect); this.toast.success('Agregado a contactos'); },
      error: (err: { error?: { message?: string } }) => { this.working.set(false); this.toast.error(err.error?.message || 'No se pudo crear el contacto'); },
    });
  }

  toLead() {
    const p = this.p();
    if (!p) return;
    this.working.set(true);
    this.api.toLead(p._id, {
      title: this.leadTitle.trim() || undefined,
      value: this.leadValue ?? undefined,
      personIndex: this.leadPerson ?? undefined,
    }).subscribe({
      next: (res) => { this.working.set(false); this.apply(res.prospect); this.toast.success('Seguimiento creado'); },
      error: (err: { error?: { message?: string } }) => { this.working.set(false); this.toast.error(err.error?.message || 'No se pudo crear el seguimiento'); },
    });
  }

  openLead() {
    const p = this.p();
    if (p?.leadId) this.router.navigate(['/leads'], { queryParams: { lead: p.leadId } });
  }

  openCustomers() { this.router.navigate(['/customers']); }

  async remove() {
    const p = this.p();
    if (!p) return;
    const ok = await this.confirm.confirm({ title: 'Eliminar prospecto', message: `¿Eliminar «${p.name}» y toda su investigación? El contacto y el seguimiento creados se conservan.`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.api.removeProspect(p._id).subscribe({
      next: () => { this.toast.success('Prospecto eliminado'); this.removed.emit(p._id); this.close(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo eliminar'),
    });
  }
}
