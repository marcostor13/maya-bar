import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule,
  type LucideIconData,
  ArrowRight,
  Bot,
  Building2,
  Check,
  ContactRound,
  FileText,
  Gauge,
  GraduationCap,
  HeartPulse,
  LayoutTemplate,
  List,
  MapPin,
  Megaphone,
  Menu,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  Store,
  Ticket,
  Upload,
  Users,
  X,
} from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { SeoService } from '../../shared/seo';
import {
  ArtCampaignComponent,
  ArtFunnelComponent,
  ArtInboxComponent,
} from './landing-art';
import { RevealDirective } from './reveal.directive';
import {
  CAPABILITY_GROUPS,
  DEFINITION,
  DIFFERENTIATORS,
  FAQS,
  GUARANTEES,
  PAINS,
  SEGMENTS,
  STEPS,
} from './landing.data';

const TITLE = 'Maya CRM — CRM de ventas y marketing con WhatsApp e IA';
const DESCRIPTION =
  'Capta contactos, respóndeles en segundos por WhatsApp con agentes de IA y envía campañas segmentadas. Formularios, eventos, listas y bandeja unificada en un solo CRM. Escríbenos por WhatsApp.';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    RouterLink,
    LucideAngularModule,
    RevealDirective,
    ArtInboxComponent,
    ArtFunnelComponent,
    ArtCampaignComponent,
  ],
  template: `
    <header class="lp-header" [class.open]="menuOpen()">
      <div class="lp-wrap header-inner">
        <a class="brand" routerLink="/" aria-label="Maya CRM, inicio">
          <img src="/logo.png" alt="Maya CRM" width="132" height="40" />
        </a>

        <nav class="header-nav" aria-label="Secciones">
          <a href="#plataforma">Plataforma</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#para-quien">Para quién</a>
          <a href="#preguntas">Preguntas</a>
        </nav>

        <div class="header-actions">
          <a class="btn btn-secondary btn-sm" routerLink="/login">Ingresar</a>
          <a class="btn btn-primary btn-sm" routerLink="/register">Crear cuenta</a>
        </div>

        <button
          type="button"
          class="header-burger"
          (click)="menuOpen.set(!menuOpen())"
          [attr.aria-expanded]="menuOpen()"
          aria-label="Abrir menú">
          <lucide-icon [img]="menuOpen() ? X : Menu" [size]="22" />
        </button>
      </div>

      @if (menuOpen()) {
        <div class="header-mobile">
          <a href="#plataforma" (click)="menuOpen.set(false)">Plataforma</a>
          <a href="#como-funciona" (click)="menuOpen.set(false)">Cómo funciona</a>
          <a href="#para-quien" (click)="menuOpen.set(false)">Para quién</a>
          <a href="#preguntas" (click)="menuOpen.set(false)">Preguntas</a>
          <div class="header-mobile-actions">
            <a class="btn btn-secondary" routerLink="/login">Ingresar</a>
            <a class="btn btn-primary" routerLink="/register">Crear cuenta</a>
          </div>
        </div>
      }
    </header>

    <main id="contenido">
      <!-- HERO -->
      <section class="hero">
        <div class="lp-wrap hero-grid">
          <div class="hero-copy">
            <p class="eyebrow">
              <lucide-icon [img]="Sparkles" [size]="14" />
              CRM de ventas y marketing con WhatsApp e IA
            </p>
            <h1>
              Capta más contactos, respóndeles en segundos y véndeles
              <em>otra vez</em>
            </h1>
            <p class="hero-sub">
              Maya CRM reúne tus formularios, tus eventos, tu base de clientes, tu WhatsApp y
              tus campañas en una sola plataforma — con agentes de inteligencia artificial que
              contestan por ti las 24 horas.
            </p>
            <div class="hero-cta">
              <a class="btn btn-primary btn-lg" [href]="waDemo()" target="_blank" rel="noopener">
                <lucide-icon [img]="MessageCircle" [size]="18" />
                Habla con nosotros por WhatsApp
              </a>
              <a class="btn btn-secondary btn-lg" href="#plataforma">
                Ver todo lo que incluye
                <lucide-icon [img]="ArrowRight" [size]="18" />
              </a>
            </div>
            <ul class="hero-trust">
              <li><lucide-icon [img]="Check" [size]="15" /> Para cualquier sector</li>
              <li><lucide-icon [img]="Check" [size]="15" /> Funciona en el navegador</li>
              <li><lucide-icon [img]="Check" [size]="15" /> Hecho para LATAM y para WhatsApp</li>
            </ul>
          </div>

          <div class="hero-art" appReveal>
            <app-art-inbox />
          </div>
        </div>
      </section>

      <!-- DEFINICIÓN (respuesta directa, para buscadores y asistentes) -->
      <section class="definition" aria-labelledby="que-es">
        <div class="lp-wrap">
          <div class="definition-card" appReveal>
            <h2 id="que-es">¿Qué es Maya CRM?</h2>
            <p>{{ definition }}</p>
          </div>
        </div>
      </section>

      <!-- PROBLEMA -->
      <section class="band" aria-labelledby="problema">
        <div class="lp-wrap">
          <p class="eyebrow center" appReveal>El costo de seguir igual</p>
          <h2 id="problema" class="section-title center" appReveal>
            Tu producto ya se vende. Lo que no funciona son las herramientas sueltas.
          </h2>
          <p class="section-intro center" appReveal>
            Cada sistema aparte es dinero que sale y leads que se pierden. Esto es lo que
            escuchamos todas las semanas.
          </p>
          <div class="grid-3">
            @for (pain of pains; track pain.title; let i = $index) {
              <article class="pain-card" [appReveal]="(i % 3) * 90">
                <h3>{{ pain.title }}</h3>
                <p>{{ pain.body }}</p>
              </article>
            }
          </div>
        </div>
      </section>

      <!-- SOLUCIÓN / MECANISMO -->
      <section class="band alt" aria-labelledby="solucion">
        <div class="lp-wrap">
          <p class="eyebrow center" appReveal>La diferencia</p>
          <h2 id="solucion" class="section-title center" appReveal>
            De desconocido a cliente sin salir de Maya CRM
          </h2>
          <p class="section-intro center" appReveal>
            Quien llenó tu formulario el lunes es la misma persona que te escribió por Instagram
            el martes y la que recibe tu campaña el jueves. No hay integraciones que mantener ni
            exportaciones que cuadrar: es el mismo sistema de principio a fin.
          </p>
          <figure class="art-wide" appReveal>
            <app-art-funnel />
            <figcaption>
              Formularios, eventos, promotores y redes alimentan una sola base de datos; de ahí
              salen la conversación y la campaña.
            </figcaption>
          </figure>
        </div>
      </section>

      <!-- PLATAFORMA / VALUE STACK -->
      <div id="plataforma">
        @for (group of groups; track group.id) {
          <section class="band" [id]="group.id" [attr.aria-labelledby]="group.id + '-t'">
            <div class="lp-wrap">
              <p class="eyebrow" appReveal>{{ group.eyebrow }}</p>
              <h2 class="section-title" [id]="group.id + '-t'" appReveal>{{ group.title }}</h2>
              <p class="section-intro" appReveal>{{ group.intro }}</p>

              @if (group.id === 'base') {
                <figure class="art-inline" appReveal>
                  <app-art-campaign />
                  <figcaption>
                    Eliges el segmento, escribes una vez y sale por WhatsApp o por email.
                  </figcaption>
                </figure>
              }

              <div class="grid-2">
                @for (item of group.items; track item.name; let i = $index) {
                  <article class="cap-card" [appReveal]="(i % 2) * 90">
                    <div class="cap-head">
                      <span class="cap-icon">
                        <lucide-icon [img]="icons[item.icon]" [size]="20" />
                      </span>
                      <div>
                        <h3>{{ item.name }}</h3>
                        <span class="badge badge-neutral">{{ item.replaces }}</span>
                      </div>
                    </div>
                    <p class="cap-body">{{ item.body }}</p>
                    <ul class="cap-list">
                      @for (b of item.bullets; track b) {
                        <li><lucide-icon [img]="Check" [size]="15" /> {{ b }}</li>
                      }
                    </ul>
                  </article>
                }
              </div>
            </div>
          </section>
        }
      </div>

      <!-- CÓMO FUNCIONA -->
      <section class="band alt" id="como-funciona" aria-labelledby="pasos">
        <div class="lp-wrap">
          <p class="eyebrow center" appReveal>Puesta en marcha</p>
          <h2 id="pasos" class="section-title center" appReveal>
            De la primera conversación a tu equipo vendiendo
          </h2>
          <p class="section-intro center" appReveal>
            No te dejamos solo frente a un panel vacío. Nosotros hacemos la configuración inicial.
          </p>
          <div class="grid-3 steps">
            @for (step of steps; track step.n; let i = $index) {
              <article class="step-card" [appReveal]="i * 110">
                <span class="step-n">{{ step.n }}</span>
                <h3>{{ step.title }}</h3>
                <p>{{ step.body }}</p>
              </article>
            }
          </div>
          <div class="center" appReveal>
            <a class="btn btn-primary btn-lg" [href]="waStart()" target="_blank" rel="noopener">
              <lucide-icon [img]="MessageCircle" [size]="18" />
              Empezar por WhatsApp
            </a>
          </div>
        </div>
      </section>

      <!-- PARA QUIÉN -->
      <section class="band" id="para-quien" aria-labelledby="segmentos">
        <div class="lp-wrap">
          <p class="eyebrow center" appReveal>Para quién es</p>
          <h2 id="segmentos" class="section-title center" appReveal>
            Cualquier equipo que capte interesados y les venda
          </h2>
          <div class="grid-3">
            @for (seg of segments; track seg.name; let i = $index) {
              <article class="seg-card" [appReveal]="(i % 3) * 90">
                <span class="cap-icon"><lucide-icon [img]="icons[seg.icon]" [size]="20" /></span>
                <h3>{{ seg.name }}</h3>
                <p>{{ seg.body }}</p>
              </article>
            }
          </div>
        </div>
      </section>

      <!-- DIFERENCIADORES -->
      <section class="band alt" aria-labelledby="porque">
        <div class="lp-wrap">
          <p class="eyebrow center" appReveal>Por qué Maya CRM</p>
          <h2 id="porque" class="section-title center" appReveal>
            Cuatro cosas que no vas a encontrar juntas en otro lado
          </h2>
          <div class="grid-2">
            @for (d of differentiators; track d.title; let i = $index) {
              <article class="diff-card" [appReveal]="(i % 2) * 90">
                <h3>{{ d.title }}</h3>
                <p>{{ d.body }}</p>
              </article>
            }
          </div>
        </div>
      </section>

      <!-- GARANTÍAS -->
      <section class="band" aria-labelledby="garantias">
        <div class="lp-wrap">
          <p class="eyebrow center" appReveal>Sin riesgo para ti</p>
          <h2 id="garantias" class="section-title center" appReveal>
            Lo que te aseguramos antes de que decidas
          </h2>
          <div class="grid-4">
            @for (g of guarantees; track g.title; let i = $index) {
              <article class="guarantee-card" [appReveal]="i * 80">
                <span class="g-icon"><lucide-icon [img]="ShieldCheck" [size]="18" /></span>
                <h3>{{ g.title }}</h3>
                <p>{{ g.body }}</p>
              </article>
            }
          </div>
        </div>
      </section>

      <!-- FAQ -->
      <section class="band alt" id="preguntas" aria-labelledby="faq">
        <div class="lp-wrap narrow">
          <p class="eyebrow center" appReveal>Preguntas frecuentes</p>
          <h2 id="faq" class="section-title center" appReveal>
            Lo que nos preguntan antes de empezar
          </h2>
          <div class="faq">
            @for (f of faqs; track f.q) {
              <details class="faq-item" appReveal>
                <summary>
                  <span>{{ f.q }}</span>
                  <span class="faq-mark" aria-hidden="true"></span>
                </summary>
                <p>{{ f.a }}</p>
              </details>
            }
          </div>
        </div>
      </section>

      <!-- CTA FINAL -->
      <section class="cta" aria-labelledby="cta">
        <div class="lp-wrap cta-inner" appReveal>
          <h2 id="cta">Cuéntanos cómo vendes y te mostramos Maya CRM con tus propios contactos</h2>
          <p>
            Una conversación por WhatsApp, sin formularios eternos. Te hacemos unas preguntas,
            te enseñamos la plataforma con tus datos y decides tú.
          </p>
          <div class="cta-actions">
            <a class="btn btn-lg cta-wa" [href]="waDemo()" target="_blank" rel="noopener">
              <lucide-icon [img]="MessageCircle" [size]="18" />
              Escribir por WhatsApp
            </a>
            <a class="btn btn-lg cta-ghost" routerLink="/register">Crear mi cuenta</a>
          </div>
        </div>
      </section>
    </main>

    <footer class="lp-footer">
      <div class="lp-wrap footer-inner">
        <div class="footer-brand">
          <a class="brand" routerLink="/" aria-label="Maya CRM, inicio">
            <img src="/logo.png" alt="Maya CRM" width="118" height="36" />
          </a>
          <p>
            CRM de ventas y marketing: captación, base de datos, WhatsApp con inteligencia
            artificial y campañas, en una sola plataforma.
          </p>
        </div>
        <nav class="footer-links" aria-label="Plataforma">
          <h3>Plataforma</h3>
          <a href="#captacion">Captación</a>
          <a href="#conversacion">Conversación e IA</a>
          <a href="#base">Base de datos</a>
          <a href="#equipo">Equipo y permisos</a>
        </nav>
        <nav class="footer-links" aria-label="Cuenta">
          <h3>Tu cuenta</h3>
          <a routerLink="/login">Ingresar</a>
          <a routerLink="/register">Crear cuenta</a>
          <a href="#preguntas">Preguntas frecuentes</a>
          <a [href]="waDemo()" target="_blank" rel="noopener">Hablar por WhatsApp</a>
        </nav>
      </div>
      <div class="lp-wrap footer-bottom">
        <span>© {{ year }} Maya CRM. Todos los derechos reservados.</span>
      </div>
    </footer>

    <a class="wa-float" [href]="waDemo()" target="_blank" rel="noopener" aria-label="Escribir por WhatsApp">
      <lucide-icon [img]="MessageCircle" [size]="24" />
    </a>
  `,
  styles: [
    `
      :host {
        display: block;
        background: var(--color-white);
      }
      .lp-wrap {
        width: 100%;
        max-width: 1160px;
        margin: 0 auto;
        padding: 0 24px;
        box-sizing: border-box;
      }
      .lp-wrap.narrow { max-width: 820px; }
      .center { text-align: center; }

      /* ---------- Aparición al scroll ----------
         El estado por defecto es visible: la clase que oculta la añade el
         navegador (ver reveal.directive.ts). Así el HTML prerenderizado que
         recibe el buscador llega completo. */
      .reveal-armed {
        opacity: 0;
        transform: translateY(22px);
        transition: opacity 620ms cubic-bezier(0.16, 1, 0.3, 1),
                    transform 620ms cubic-bezier(0.16, 1, 0.3, 1);
        will-change: opacity, transform;
      }
      .reveal-in {
        opacity: 1;
        transform: none;
      }
      @media (prefers-reduced-motion: reduce) {
        .reveal-armed { opacity: 1; transform: none; transition: none; }
      }

      /* ---------- Header ---------- */
      .lp-header {
        position: sticky;
        top: 0;
        z-index: 50;
        background: rgba(255, 255, 255, 0.88);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--color-border);
      }
      .header-inner {
        display: flex;
        align-items: center;
        gap: 24px;
        height: 72px;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        text-decoration: none;
      }
      /* object-fit contain y no cover: el logo lleva el nombre dentro, así
         que recortarlo se comería parte de la palabra. */
      .brand img {
        height: 40px;
        width: auto;
        max-width: 168px;
        object-fit: contain;
      }
      .header-nav {
        display: flex;
        gap: 28px;
        margin-left: auto;
      }
      .header-nav a {
        color: var(--color-text-muted);
        text-decoration: none;
        font-size: 14px;
        font-weight: 500;
        transition: color var(--transition-fast);
      }
      .header-nav a:hover { color: var(--color-brand); }
      .header-actions { display: flex; gap: 10px; }
      .header-burger {
        display: none;
        background: none;
        border: none;
        color: var(--color-text-main);
        cursor: pointer;
        padding: 8px;
      }
      .header-mobile {
        display: none;
        flex-direction: column;
        gap: 4px;
        padding: 8px 24px 20px;
        border-top: 1px solid var(--color-border);
      }
      .header-mobile a {
        color: var(--color-text-main);
        text-decoration: none;
        font-size: 15px;
        padding: 12px 0;
      }
      .header-mobile-actions { display: flex; gap: 10px; margin-top: 8px; }
      .header-mobile-actions .btn { flex: 1; }

      /* ---------- Hero ---------- */
      .hero {
        padding: 76px 0 68px;
        background:
          radial-gradient(1000px 460px at 20% -160px, var(--color-brand-light), transparent 70%),
          var(--color-white);
      }
      .hero-grid {
        display: grid;
        grid-template-columns: 1.12fr 0.88fr;
        gap: 48px;
        align-items: center;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 20px;
        padding: 7px 16px;
        border-radius: var(--radius-pill);
        background: var(--color-brand-light);
        color: var(--color-brand);
        font-family: var(--font-heading);
        font-weight: 600;
        font-size: 12.5px;
        letter-spacing: 0.01em;
      }
      h1 {
        font-size: clamp(31px, 3.3vw, 44px);
        line-height: 1.12;
        margin: 0 0 20px;
        font-weight: 700;
      }
      h1 em {
        font-style: normal;
        color: var(--color-brand);
      }
      .hero-sub {
        max-width: 52ch;
        margin: 0 0 32px;
        font-size: 17px;
        line-height: 1.65;
        color: var(--color-text-muted);
      }
      .hero-cta {
        display: flex;
        gap: 14px;
        flex-wrap: wrap;
        margin-bottom: 30px;
      }
      .hero-cta .btn { gap: 9px; }
      .hero-trust {
        list-style: none;
        display: flex;
        gap: 22px;
        flex-wrap: wrap;
        margin: 0;
        padding: 0;
      }
      .hero-trust li {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 14px;
        color: var(--color-text-muted);
      }
      .hero-trust lucide-icon { color: var(--color-success); }

      /* ---------- Ilustraciones ---------- */
      .art-wide, .art-inline {
        margin: 0;
        background: var(--color-white);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: 28px;
        box-shadow: var(--shadow-sm);
      }
      .art-wide { margin-top: 8px; }
      .art-inline { margin-bottom: 26px; }
      .art-wide figcaption, .art-inline figcaption {
        margin-top: 18px;
        text-align: center;
        font-size: 13.5px;
        line-height: 1.6;
        color: var(--color-text-muted);
      }
      .art-inline app-art-campaign {
        display: block;
        max-width: 420px;
        margin: 0 auto;
      }

      /* ---------- Definición ---------- */
      .definition { padding: 0 0 64px; }
      .definition-card {
        background: var(--color-text-main);
        color: var(--color-white);
        border-radius: var(--radius-lg);
        padding: 36px 40px;
        box-shadow: var(--shadow-lg);
      }
      .definition-card h2 {
        color: var(--color-white);
        font-size: 21px;
        margin-bottom: 12px;
      }
      .definition-card p {
        margin: 0;
        font-size: 16px;
        line-height: 1.7;
        color: rgba(255, 255, 255, 0.82);
      }

      /* ---------- Bandas ---------- */
      .band { padding: 76px 0; }
      .band.alt { background: var(--color-bg-light); }
      .section-title {
        font-size: clamp(26px, 3.2vw, 36px);
        line-height: 1.2;
        margin: 0 0 14px;
        max-width: 24ch;
      }
      .section-title.center { max-width: 26ch; margin-left: auto; margin-right: auto; }
      .section-intro {
        font-size: 16.5px;
        line-height: 1.7;
        color: var(--color-text-muted);
        margin: 0 0 42px;
        max-width: 64ch;
      }
      .section-intro.center { margin-left: auto; margin-right: auto; }

      .grid-2, .grid-3, .grid-4 { display: grid; gap: 20px; }
      .grid-2 { grid-template-columns: repeat(2, 1fr); }
      .grid-3 { grid-template-columns: repeat(3, 1fr); }
      .grid-4 { grid-template-columns: repeat(4, 1fr); }

      /* ---------- Tarjetas ---------- */
      .pain-card, .cap-card, .step-card, .seg-card, .diff-card, .guarantee-card {
        background: var(--color-white);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: 24px;
        transition: transform var(--transition-smooth),
                    box-shadow var(--transition-smooth),
                    border-color var(--transition-smooth),
                    opacity 620ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .pain-card:hover, .cap-card:hover, .seg-card:hover,
      .diff-card:hover, .guarantee-card:hover {
        transform: translateY(-4px);
        box-shadow: var(--shadow-lg);
        border-color: transparent;
      }
      .pain-card h3, .step-card h3, .seg-card h3, .diff-card h3, .guarantee-card h3 {
        font-size: 16.5px;
        margin: 0 0 10px;
      }
      .pain-card p, .step-card p, .seg-card p, .diff-card p, .guarantee-card p {
        margin: 0;
        font-size: 14.5px;
        line-height: 1.65;
        color: var(--color-text-muted);
      }
      .pain-card { border-left: 3px solid var(--color-brand); }

      .cap-head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
      .cap-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        flex: none;
        border-radius: 14px;
        background: var(--color-brand-light);
        color: var(--color-brand);
      }
      .cap-head h3 { font-size: 17px; margin: 0 0 7px; }
      .cap-body {
        margin: 0 0 16px;
        font-size: 14.5px;
        line-height: 1.65;
        color: var(--color-text-muted);
      }
      .cap-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }
      .cap-list li {
        display: flex;
        gap: 9px;
        align-items: flex-start;
        font-size: 14px;
        line-height: 1.5;
        color: var(--color-text-main);
      }
      .cap-list lucide-icon { color: var(--color-success); flex: none; margin-top: 2px; }

      .steps { margin-bottom: 40px; }
      .step-card { position: relative; padding-top: 28px; }
      .step-n {
        display: block;
        font-family: var(--font-heading);
        font-weight: 700;
        font-size: 30px;
        color: var(--color-brand);
        opacity: 0.28;
        margin-bottom: 6px;
      }
      .seg-card .cap-icon { margin-bottom: 14px; }
      .g-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        border-radius: 12px;
        background: #ECFDF5;
        color: var(--color-success);
        margin-bottom: 14px;
      }

      /* ---------- FAQ ---------- */
      .faq { display: grid; gap: 12px; }
      .faq-item {
        background: var(--color-white);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 4px 24px;
      }
      .faq-item summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 0;
        cursor: pointer;
        list-style: none;
        font-family: var(--font-heading);
        font-weight: 600;
        font-size: 15.5px;
      }
      .faq-item summary::-webkit-details-marker { display: none; }
      .faq-mark {
        position: relative;
        flex: none;
        width: 16px;
        height: 16px;
      }
      .faq-mark::before, .faq-mark::after {
        content: '';
        position: absolute;
        background: var(--color-brand);
        border-radius: 2px;
        transition: transform var(--transition-fast);
      }
      .faq-mark::before { top: 7px; left: 0; width: 16px; height: 2px; }
      .faq-mark::after { top: 0; left: 7px; width: 2px; height: 16px; }
      .faq-item[open] .faq-mark::after { transform: rotate(90deg); }
      .faq-item p {
        margin: 0;
        padding: 0 0 20px;
        font-size: 15px;
        line-height: 1.7;
        color: var(--color-text-muted);
        max-width: 68ch;
      }

      /* ---------- CTA final ---------- */
      .cta {
        padding: 84px 0;
        background: linear-gradient(135deg, var(--color-brand) 0%, #9F1239 100%);
      }
      .cta-inner { text-align: center; }
      .cta h2 {
        color: var(--color-white);
        font-size: clamp(26px, 3.4vw, 38px);
        line-height: 1.2;
        margin: 0 auto 16px;
        max-width: 24ch;
      }
      .cta p {
        color: rgba(255, 255, 255, 0.86);
        font-size: 16.5px;
        line-height: 1.7;
        max-width: 58ch;
        margin: 0 auto 32px;
      }
      .cta-actions { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
      .cta-wa {
        background: var(--color-white);
        color: var(--color-brand);
        gap: 9px;
        box-shadow: var(--shadow-lg);
      }
      .cta-wa:hover { transform: translateY(-2px); }
      .cta-ghost {
        background: transparent;
        color: var(--color-white);
        border: 1px solid rgba(255, 255, 255, 0.5);
      }
      .cta-ghost:hover { background: rgba(255, 255, 255, 0.12); }

      /* ---------- Footer ---------- */
      .lp-footer { background: var(--color-text-main); color: rgba(255, 255, 255, 0.66); }
      .footer-inner {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr;
        gap: 40px;
        padding-top: 56px;
        padding-bottom: 40px;
      }
      .lp-footer .brand { margin-bottom: 16px; }
      .lp-footer .brand img { height: 36px; }
      .footer-brand p { margin: 0; font-size: 14.5px; line-height: 1.7; max-width: 42ch; }
      .footer-links { display: flex; flex-direction: column; gap: 11px; }
      .footer-links h3 {
        color: var(--color-white);
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin: 0 0 4px;
      }
      .footer-links a {
        color: rgba(255, 255, 255, 0.66);
        text-decoration: none;
        font-size: 14.5px;
        transition: color var(--transition-fast);
      }
      .footer-links a:hover { color: var(--color-white); }
      .footer-bottom {
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        padding-top: 22px;
        padding-bottom: 26px;
        font-size: 13.5px;
      }

      /* ---------- Botón flotante ---------- */
      .wa-float {
        position: fixed;
        right: 22px;
        bottom: 22px;
        z-index: 60;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: #25D366;
        color: var(--color-white);
        box-shadow: 0 12px 30px -8px rgba(37, 211, 102, 0.6);
        transition: transform var(--transition-smooth);
      }
      .wa-float:hover { transform: scale(1.08); }

      /* ---------- Responsive ---------- */
      @media (max-width: 1024px) {
        .hero-grid { grid-template-columns: 1fr; gap: 40px; }
        .hero-art { max-width: 480px; }
        .grid-4 { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 900px) {
        .header-nav, .header-actions { display: none; }
        .header-burger { display: inline-flex; margin-left: auto; }
        .lp-header.open .header-mobile { display: flex; }
        .grid-2, .grid-3 { grid-template-columns: 1fr; }
        .footer-inner { grid-template-columns: 1fr; gap: 32px; }
      }
      @media (max-width: 640px) {
        .hero { padding: 48px 0; }
        .band { padding: 56px 0; }
        .grid-4 { grid-template-columns: 1fr; }
        .definition-card { padding: 26px 22px; }
        .art-wide, .art-inline { padding: 18px; }
        .hero-cta .btn, .cta-actions .btn { width: 100%; }
        .brand img { height: 34px; }
      }
    `,
  ],
})
export class LandingComponent implements OnInit {
  private seo = inject(SeoService);

  readonly definition = DEFINITION;
  readonly pains = PAINS;
  readonly groups = CAPABILITY_GROUPS;
  readonly steps = STEPS;
  readonly segments = SEGMENTS;
  readonly differentiators = DIFFERENTIATORS;
  readonly guarantees = GUARANTEES;
  readonly faqs = FAQS;
  readonly year = new Date().getFullYear();

  menuOpen = signal(false);

  /** Íconos referenciados por nombre desde `landing.data.ts`. */
  readonly icons: Record<string, LucideIconData> = {
    FileText, Ticket, Upload, MapPin, Bot, MessagesSquare, LayoutTemplate,
    ContactRound, List, Megaphone, Gauge, Users, Building2, GraduationCap,
    HeartPulse, Store, Sparkles,
  };

  readonly ArrowRight = ArrowRight;
  readonly Check = Check;
  readonly Menu = Menu;
  readonly MessageCircle = MessageCircle;
  readonly ShieldCheck = ShieldCheck;
  readonly Sparkles = Sparkles;
  readonly X = X;

  private wa(text: string): string {
    return `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent(text)}`;
  }

  waDemo = computed(() =>
    this.wa('Hola, quiero ver una demo de Maya CRM para mi equipo.'),
  );
  waStart = computed(() =>
    this.wa('Hola, quiero empezar a usar Maya CRM. ¿Cómo arrancamos?'),
  );

  ngOnInit(): void {
    const siteUrl = environment.siteUrl;

    this.seo.apply({
      title: TITLE,
      description: DESCRIPTION,
      path: '/',
      image: '/logo.png',
      siteName: 'Maya CRM',
      siteUrl,
    });

    this.seo.setJsonLd('app', {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Maya CRM',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Customer Relationship Management Software',
      operatingSystem: 'Web',
      url: siteUrl,
      description: DEFINITION,
      inLanguage: 'es',
      audience: {
        '@type': 'BusinessAudience',
        audienceType: 'Equipos de ventas y marketing',
      },
      featureList: this.groups.flatMap((g) => g.items.map((i) => i.name)),
      provider: {
        '@type': 'Organization',
        name: 'Maya CRM',
        url: siteUrl,
        logo: `${siteUrl}/logo.png`,
      },
    });

    this.seo.setJsonLd('faq', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: this.faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });

    this.seo.setJsonLd('site', {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Maya CRM',
      url: siteUrl,
      inLanguage: 'es',
    });
  }
}
