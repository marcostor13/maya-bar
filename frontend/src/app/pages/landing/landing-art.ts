import { Component } from '@angular/core';

/**
 * Ilustraciones de la landing.
 *
 * Son SVG escritos a mano y no capturas ni fotos de stock por tres razones: se
 * escalan sin pixelarse, pesan unos pocos kilobytes frente a los cientos de una
 * imagen, y usan las variables de color del sistema de diseño, así que no se
 * quedan desfasadas cuando cambia la marca. Todas van marcadas como decorativas
 * (`aria-hidden`) porque lo que cuentan ya está escrito en el texto de al lado.
 */

/** Bandeja unificada con un agente de IA respondiendo. Cabecera. */
@Component({
  selector: 'app-art-inbox',
  standalone: true,
  template: `
    <svg viewBox="0 0 420 330" role="img" aria-hidden="true" focusable="false">
      <defs>
        <filter id="ai-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0F172A" flood-opacity="0.10" />
        </filter>
      </defs>

      <!-- Ventana -->
      <rect class="surface" x="8" y="8" width="404" height="314" rx="22" filter="url(#ai-shadow)" />

      <!-- Barra de canal -->
      <rect class="brand-soft" x="8" y="8" width="404" height="52" rx="22" />
      <rect class="brand-soft" x="8" y="40" width="404" height="20" />
      <circle class="wa" cx="42" cy="34" r="13" />
      <path d="M36.5 34.5a5.5 5.5 0 1 1 2.2 4.4l-2.9.8.8-2.8a5.5 5.5 0 0 1-.1-2.4Z" fill="#FFF" />
      <rect class="ink" x="66" y="27" width="96" height="8" rx="4" opacity="0.85" />
      <rect class="muted" x="66" y="41" width="58" height="6" rx="3" />
      <rect class="brand" x="330" y="24" width="62" height="20" rx="10" opacity="0.14" />
      <circle class="brand" cx="343" cy="34" r="3.5" />
      <rect class="brand" x="352" y="31" width="30" height="6" rx="3" opacity="0.75" />

      <!-- Mensaje entrante -->
      <rect class="line" x="30" y="80" width="196" height="46" rx="14" opacity="0.55" />
      <rect class="ink" x="44" y="93" width="150" height="7" rx="3.5" opacity="0.55" />
      <rect class="ink" x="44" y="107" width="106" height="7" rx="3.5" opacity="0.3" />

      <!-- Respuesta del agente -->
      <rect class="brand" x="150" y="140" width="240" height="62" rx="14" opacity="0.95" />
      <rect x="164" y="155" width="196" height="7" rx="3.5" fill="#FFF" opacity="0.9" />
      <rect x="164" y="169" width="166" height="7" rx="3.5" fill="#FFF" opacity="0.62" />
      <rect x="164" y="183" width="120" height="7" rx="3.5" fill="#FFF" opacity="0.45" />
      <rect class="ai" x="150" y="210" width="86" height="18" rx="9" opacity="0.16" />
      <circle class="ai" cx="163" cy="219" r="3.5" />
      <rect class="ai" x="172" y="216" width="52" height="6" rx="3" opacity="0.8" />

      <!-- Ficha del contacto -->
      <rect class="surface" x="30" y="244" width="360" height="60" rx="16" />
      <rect class="line" x="30" y="244" width="360" height="60" rx="16" opacity="0" />
      <path d="M30 260a16 16 0 0 1 16-16h328a16 16 0 0 1 16 16v28a16 16 0 0 1-16 16H46a16 16 0 0 1-16-16Z"
            fill="none" stroke="var(--color-border)" stroke-width="1.5" />
      <circle class="brand-soft" cx="60" cy="274" r="16" />
      <circle class="brand" cx="60" cy="269" r="5" opacity="0.6" />
      <path d="M50 282a10 10 0 0 1 20 0Z" class="brand" opacity="0.6" />
      <rect class="ink" x="86" y="262" width="104" height="8" rx="4" opacity="0.8" />
      <rect class="muted" x="86" y="277" width="150" height="6" rx="3" />
      <rect class="brand-soft" x="300" y="264" width="46" height="18" rx="9" />
      <rect class="brand" x="308" y="270" width="30" height="6" rx="3" opacity="0.7" />
      <rect class="line" x="352" y="264" width="30" height="18" rx="9" />
    </svg>
  `,
  styleUrls: ['./landing-art.scss'],
})
export class ArtInboxComponent {}

/** Recorrido de un contacto: de dónde entra hasta la campaña. */
@Component({
  selector: 'app-art-funnel',
  standalone: true,
  template: `
    <svg viewBox="0 0 900 220" role="img" aria-hidden="true" focusable="false">
      <!-- Orígenes -->
      <g>
        <rect class="surface stroke" x="4" y="16" width="150" height="38" rx="19" />
        <circle class="brand" cx="30" cy="35" r="4" />
        <rect class="ink" x="44" y="31" width="88" height="7" rx="3.5" opacity="0.65" />

        <rect class="surface stroke" x="4" y="66" width="150" height="38" rx="19" />
        <circle class="brand" cx="30" cy="85" r="4" />
        <rect class="ink" x="44" y="81" width="70" height="7" rx="3.5" opacity="0.65" />

        <rect class="surface stroke" x="4" y="116" width="150" height="38" rx="19" />
        <circle class="brand" cx="30" cy="135" r="4" />
        <rect class="ink" x="44" y="131" width="94" height="7" rx="3.5" opacity="0.65" />

        <rect class="surface stroke" x="4" y="166" width="150" height="38" rx="19" />
        <circle class="brand" cx="30" cy="185" r="4" />
        <rect class="ink" x="44" y="181" width="60" height="7" rx="3.5" opacity="0.65" />
      </g>

      <!-- Convergencia -->
      <g fill="none" stroke="var(--color-brand)" stroke-width="1.6" opacity="0.4">
        <path d="M160 35 C 210 35, 210 110, 262 110" />
        <path d="M160 85 C 210 85, 215 110, 262 110" />
        <path d="M160 135 C 210 135, 215 110, 262 110" />
        <path d="M160 185 C 210 185, 210 110, 262 110" />
      </g>

      <!-- Base de datos -->
      <rect class="brand" x="266" y="72" width="152" height="76" rx="20" />
      <rect x="288" y="94" width="108" height="8" rx="4" fill="#FFF" opacity="0.92" />
      <rect x="288" y="110" width="82" height="7" rx="3.5" fill="#FFF" opacity="0.6" />
      <rect x="288" y="125" width="96" height="7" rx="3.5" fill="#FFF" opacity="0.42" />

      <path d="M424 110 h44" stroke="var(--color-brand)" stroke-width="1.6" opacity="0.4" fill="none" />
      <path d="M462 104 l10 6 -10 6Z" class="brand" opacity="0.5" />

      <!-- Conversación + IA -->
      <rect class="surface stroke" x="478" y="60" width="164" height="100" rx="20" />
      <rect class="line" x="500" y="84" width="86" height="7" rx="3.5" />
      <rect class="brand" x="500" y="102" width="118" height="7" rx="3.5" opacity="0.55" />
      <rect class="brand" x="500" y="118" width="96" height="7" rx="3.5" opacity="0.35" />
      <rect class="ai" x="500" y="134" width="62" height="14" rx="7" opacity="0.16" />
      <circle class="ai" cx="510" cy="141" r="3" />
      <rect class="ai" x="518" y="138" width="34" height="5" rx="2.5" opacity="0.8" />

      <path d="M648 110 h44" stroke="var(--color-brand)" stroke-width="1.6" opacity="0.4" fill="none" />
      <path d="M686 104 l10 6 -10 6Z" class="brand" opacity="0.5" />

      <!-- Campaña segmentada -->
      <g>
        <rect class="surface stroke" x="702" y="34" width="194" height="44" rx="16" />
        <rect class="brand-soft" x="720" y="48" width="46" height="16" rx="8" />
        <rect class="ink" x="778" y="52" width="94" height="7" rx="3.5" opacity="0.55" />

        <rect class="surface stroke" x="702" y="88" width="194" height="44" rx="16" />
        <rect class="brand-soft" x="720" y="102" width="60" height="16" rx="8" />
        <rect class="ink" x="792" y="106" width="80" height="7" rx="3.5" opacity="0.55" />

        <rect class="surface stroke" x="702" y="142" width="194" height="44" rx="16" />
        <rect class="brand-soft" x="720" y="156" width="38" height="16" rx="8" />
        <rect class="ink" x="770" y="160" width="102" height="7" rx="3.5" opacity="0.55" />
      </g>
    </svg>
  `,
  styleUrls: ['./landing-art.scss'],
})
export class ArtFunnelComponent {}

/** Segmento elegido y campaña saliendo. Acompaña a la base de datos. */
@Component({
  selector: 'app-art-campaign',
  standalone: true,
  template: `
    <svg viewBox="0 0 420 250" role="img" aria-hidden="true" focusable="false">
      <defs>
        <filter id="cmp-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0F172A" flood-opacity="0.09" />
        </filter>
      </defs>

      <rect class="surface" x="8" y="8" width="404" height="234" rx="22" filter="url(#cmp-shadow)" />

      <!-- Selector de segmento -->
      <rect class="ink" x="34" y="34" width="88" height="8" rx="4" opacity="0.8" />
      <rect class="brand-soft" x="34" y="56" width="104" height="26" rx="13" />
      <rect class="brand" x="48" y="66" width="60" height="6" rx="3" opacity="0.75" />
      <rect class="line" x="148" y="56" width="88" height="26" rx="13" />
      <rect class="muted" x="162" y="66" width="46" height="6" rx="3" />
      <rect class="line" x="246" y="56" width="72" height="26" rx="13" />
      <rect class="muted" x="260" y="66" width="36" height="6" rx="3" />

      <!-- Contador de destinatarios -->
      <rect class="brand" x="34" y="98" width="140" height="44" rx="14" opacity="0.08" />
      <rect class="brand" x="50" y="110" width="52" height="12" rx="6" />
      <rect class="brand" x="50" y="128" width="90" height="6" rx="3" opacity="0.45" />

      <!-- Mensaje -->
      <rect class="line" x="190" y="98" width="196" height="44" rx="14" opacity="0.5" />
      <rect class="ink" x="206" y="110" width="150" height="7" rx="3.5" opacity="0.5" />
      <rect class="ink" x="206" y="124" width="112" height="7" rx="3.5" opacity="0.28" />

      <!-- Canales -->
      <rect class="wa" x="34" y="162" width="118" height="34" rx="17" opacity="0.14" />
      <circle class="wa" cx="56" cy="179" r="8" />
      <rect class="wa" x="72" y="176" width="62" height="6" rx="3" opacity="0.85" />

      <rect class="brand" x="164" y="162" width="104" height="34" rx="17" opacity="0.1" />
      <circle class="brand" cx="186" cy="179" r="8" opacity="0.85" />
      <rect class="brand" x="202" y="176" width="48" height="6" rx="3" opacity="0.7" />

      <!-- Botón enviar -->
      <rect class="brand" x="280" y="162" width="106" height="34" rx="17" />
      <rect x="300" y="176" width="52" height="6" rx="3" fill="#FFF" opacity="0.95" />
      <path d="M362 173 l10 6 -10 6 2-6Z" fill="#FFF" opacity="0.95" />
    </svg>
  `,
  styleUrls: ['./landing-art.scss'],
})
export class ArtCampaignComponent {}
