import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule,
  type LucideIconData,
  ArrowRight,
  Bot,
  CalendarCheck,
  Check,
  ChefHat,
  Coffee,
  ContactRound,
  FileText,
  Gauge,
  MapPin,
  Martini,
  Megaphone,
  Menu,
  MessageCircle,
  MessagesSquare,
  QrCode,
  ShieldCheck,
  Sparkles,
  Store,
  Ticket,
  UtensilsCrossed,
  Users,
  X,
  Zap,
} from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { SeoService } from '../../shared/seo';
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

const TITLE =
  'Maya — Software todo-en-uno para restaurantes, bares y discotecas';
const DESCRIPTION =
  'Carta QR, pedidos desde la mesa, pantalla de cocina, reservas, eventos, CRM y agentes de IA que responden por WhatsApp e Instagram. Una sola plataforma para tu local. Escríbenos por WhatsApp.';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  template: `
    <header class="lp-header" [class.open]="menuOpen()">
      <div class="lp-wrap header-inner">
        <a class="brand" routerLink="/" aria-label="Maya, inicio">
          <img src="/logo.png" alt="Maya" width="36" height="36" />
          <span>Maya</span>
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
        <div class="lp-wrap hero-inner">
          <p class="eyebrow">
            <lucide-icon [img]="Sparkles" [size]="14" />
            Operación, clientes e inteligencia artificial en un solo lugar
          </p>
          <h1>
            Llena tu local, saca los pedidos a tiempo y haz que tus clientes
            <em>vuelvan</em>
          </h1>
          <p class="hero-sub">
            Maya reúne carta con QR, pedidos desde la mesa, pantalla de cocina, reservas,
            eventos, CRM y agentes de IA que atienden tu WhatsApp e Instagram.
            Sin instalar nada y funcionando esta misma semana.
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
            <li><lucide-icon [img]="Check" [size]="15" /> Multi-local desde el primer día</li>
            <li><lucide-icon [img]="Check" [size]="15" /> Funciona en el navegador</li>
            <li><lucide-icon [img]="Check" [size]="15" /> Hecha para LATAM y para WhatsApp</li>
          </ul>
        </div>
      </section>

      <!-- DEFINICIÓN (respuesta directa, para buscadores y asistentes) -->
      <section class="definition" aria-labelledby="que-es">
        <div class="lp-wrap">
          <div class="definition-card">
            <h2 id="que-es">¿Qué es Maya?</h2>
            <p>{{ definition }}</p>
          </div>
        </div>
      </section>

      <!-- PROBLEMA -->
      <section class="band" aria-labelledby="problema">
        <div class="lp-wrap">
          <p class="eyebrow center">El costo de seguir igual</p>
          <h2 id="problema" class="section-title center">
            Tu local ya funciona. Lo que no funciona son las herramientas sueltas.
          </h2>
          <p class="section-intro center">
            Cada sistema aparte es dinero que sale y datos que se pierden. Esto es lo que
            escuchamos todas las semanas.
          </p>
          <div class="grid-3">
            @for (pain of pains; track pain.title) {
              <article class="pain-card">
                <h3>{{ pain.title }}</h3>
                <p>{{ pain.body }}</p>
              </article>
            }
          </div>
        </div>
      </section>

      <!-- SOLUCIÓN / MECANISMO -->
      <section class="band alt" aria-labelledby="solucion">
        <div class="lp-wrap solution">
          <p class="eyebrow center">La diferencia</p>
          <h2 id="solucion" class="section-title center">
            Una sola base de datos para tu carta, tus mesas, tus clientes y tus conversaciones
          </h2>
          <p class="section-intro center">
            Quien pidió por QR el viernes es la misma persona que reservó el sábado y la que
            recibe tu campaña el jueves. No hay integraciones que mantener ni exportaciones
            que cuadrar: es el mismo sistema de principio a fin.
          </p>
          <div class="flow">
            <span>Escanea el QR</span>
            <lucide-icon [img]="ArrowRight" [size]="16" />
            <span>Pide desde la mesa</span>
            <lucide-icon [img]="ArrowRight" [size]="16" />
            <span>Cocina y barra lo ven</span>
            <lucide-icon [img]="ArrowRight" [size]="16" />
            <span>Entra a tu CRM</span>
            <lucide-icon [img]="ArrowRight" [size]="16" />
            <span>Vuelve con tu campaña</span>
          </div>
        </div>
      </section>

      <!-- PLATAFORMA / VALUE STACK -->
      <div id="plataforma">
        @for (group of groups; track group.id) {
          <section class="band" [id]="group.id" [attr.aria-labelledby]="group.id + '-t'">
            <div class="lp-wrap">
              <p class="eyebrow">{{ group.eyebrow }}</p>
              <h2 class="section-title" [id]="group.id + '-t'">{{ group.title }}</h2>
              <p class="section-intro">{{ group.intro }}</p>
              <div class="grid-2">
                @for (item of group.items; track item.name) {
                  <article class="cap-card">
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
          <p class="eyebrow center">Puesta en marcha</p>
          <h2 id="pasos" class="section-title center">De la primera conversación a tu equipo trabajando</h2>
          <p class="section-intro center">
            No te dejamos solo frente a un panel vacío. Nosotros hacemos la configuración inicial.
          </p>
          <div class="grid-3 steps">
            @for (step of steps; track step.n) {
              <article class="step-card">
                <span class="step-n">{{ step.n }}</span>
                <h3>{{ step.title }}</h3>
                <p>{{ step.body }}</p>
              </article>
            }
          </div>
          <div class="center">
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
          <p class="eyebrow center">Para quién es</p>
          <h2 id="segmentos" class="section-title center">Hecha para negocios que atienden gente</h2>
          <div class="grid-4">
            @for (seg of segments; track seg.name) {
              <article class="seg-card">
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
          <p class="eyebrow center">Por qué Maya</p>
          <h2 id="porque" class="section-title center">Cuatro cosas que no vas a encontrar juntas en otro lado</h2>
          <div class="grid-2">
            @for (d of differentiators; track d.title) {
              <article class="diff-card">
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
          <p class="eyebrow center">Sin riesgo para ti</p>
          <h2 id="garantias" class="section-title center">Lo que te aseguramos antes de que decidas</h2>
          <div class="grid-4">
            @for (g of guarantees; track g.title) {
              <article class="guarantee-card">
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
          <p class="eyebrow center">Preguntas frecuentes</p>
          <h2 id="faq" class="section-title center">Lo que nos preguntan antes de empezar</h2>
          <div class="faq">
            @for (f of faqs; track f.q) {
              <details class="faq-item">
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
        <div class="lp-wrap cta-inner">
          <h2 id="cta">Cuéntanos cómo funciona tu local y te mostramos Maya con tu propia carta</h2>
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
          <a class="brand" routerLink="/">
            <img src="/logo.png" alt="Maya" width="32" height="32" />
            <span>Maya</span>
          </a>
          <p>
            Plataforma todo-en-uno para restaurantes, bares, discotecas, cafeterías y
            productoras de eventos.
          </p>
        </div>
        <nav class="footer-links" aria-label="Plataforma">
          <h3>Plataforma</h3>
          <a href="#operacion">Operación</a>
          <a href="#clientes">Clientes e IA</a>
          <a href="#gestion">Equipo y permisos</a>
          <a href="#para-quien">Para quién es</a>
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
        <span>© {{ year }} Maya. Todos los derechos reservados.</span>
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
        height: 68px;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        text-decoration: none;
        color: var(--color-text-main);
        font-family: var(--font-heading);
        font-weight: 700;
        font-size: 19px;
      }
      .brand img { border-radius: 10px; object-fit: cover; }
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
        padding: 88px 0 72px;
        background:
          radial-gradient(1000px 460px at 50% -140px, var(--color-brand-light), transparent 70%),
          var(--color-white);
      }
      .hero-inner { text-align: center; }
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
      .eyebrow.center { display: inline-flex; }
      h1 {
        font-size: clamp(34px, 5.4vw, 60px);
        line-height: 1.08;
        margin: 0 auto 20px;
        max-width: 19ch;
        font-weight: 700;
      }
      h1 em {
        font-style: normal;
        color: var(--color-brand);
      }
      .hero-sub {
        max-width: 660px;
        margin: 0 auto 34px;
        font-size: 17.5px;
        line-height: 1.65;
        color: var(--color-text-muted);
      }
      .hero-cta {
        display: flex;
        gap: 14px;
        justify-content: center;
        flex-wrap: wrap;
        margin-bottom: 36px;
      }
      .hero-cta .btn { gap: 9px; }
      .hero-trust {
        list-style: none;
        display: flex;
        gap: 26px;
        justify-content: center;
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
        max-width: 22ch;
      }
      .section-title.center { max-width: 24ch; margin-left: auto; margin-right: auto; }
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
        transition: all var(--transition-smooth);
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

      .flow {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 8px;
      }
      .flow span {
        background: var(--color-white);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
        padding: 10px 20px;
        font-family: var(--font-heading);
        font-weight: 600;
        font-size: 13.5px;
        box-shadow: var(--shadow-sm);
      }
      .flow lucide-icon { color: var(--color-brand); }

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
      .lp-footer .brand { color: var(--color-white); margin-bottom: 14px; }
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
        .hero { padding: 56px 0 52px; }
        .band { padding: 56px 0; }
        .grid-4 { grid-template-columns: 1fr; }
        .definition-card { padding: 26px 22px; }
        .hero-cta .btn, .cta-actions .btn { width: 100%; }
        .flow lucide-icon { transform: rotate(90deg); }
        .flow { flex-direction: column; }
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
    QrCode, ChefHat, CalendarCheck, Store, Bot, MessagesSquare, ContactRound,
    Megaphone, FileText, Zap, Users, MapPin, Gauge, UtensilsCrossed, Martini,
    Coffee, Ticket,
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
    this.wa('Hola, quiero ver una demo de Maya para mi local.'),
  );
  waStart = computed(() =>
    this.wa('Hola, quiero empezar a usar Maya. ¿Cómo arrancamos?'),
  );

  ngOnInit(): void {
    const siteUrl = environment.siteUrl;

    this.seo.apply({
      title: TITLE,
      description: DESCRIPTION,
      path: '/',
      image: '/logo.png',
      siteUrl,
    });

    this.seo.setJsonLd('app', {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Maya',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Restaurant Management Software',
      operatingSystem: 'Web',
      url: siteUrl,
      description: DEFINITION,
      inLanguage: 'es',
      audience: {
        '@type': 'BusinessAudience',
        audienceType:
          'Restaurantes, bares, discotecas, cafeterías y productoras de eventos',
      },
      featureList: this.groups.flatMap((g) => g.items.map((i) => i.name)),
      provider: {
        '@type': 'Organization',
        name: 'Maya',
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
      name: 'Maya',
      url: siteUrl,
      inLanguage: 'es',
    });
  }
}
