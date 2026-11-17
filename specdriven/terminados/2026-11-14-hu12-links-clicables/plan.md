# HU12 — Links clicables en los mensajes de los chats · Plan técnico

## Estado actual

- `frontend/src/app/pages/inbox/inbox.ts:841` → `<p class="bubble-text">{{ m.text }}</p>`;
  `:849` lectura de adjuntos `{{ m.transcript }}`; `:768` nota del sistema `{{ m.text }}`.
- `frontend/src/app/pages/ai-agents/ai-agents.ts:780` → burbuja del playground `{{ m.content }}`.
- `frontend/src/app/pages/leads/leads.ts:551` → `{{ a.body }}`; `frontend/src/app/pages/customers/contact-care.ts:197` → `{{ item.body }}`.
- No hay ningún detector de links ni uso de `innerHTML` en estas vistas.

## Diseño

- **Datos / API / integraciones:** no aplica (solo presentación).
- **Interfaz:**
  - `frontend/src/app/shared/linkify.ts`: `linkify(text): Segment[]` (pura,
    una regex global con alternativas URL | www | correo; recorte de
    puntuación final y de `)` desbalanceado; `href` solo `https?:`/`mailto:`).
  - `frontend/src/app/shared/rich-text.ts`: componente standalone
    `app-rich-text` (`display: contents` en el host para no alterar el
    `pre-wrap` del padre), input `text`, `segments = computed(() => linkify(text()))`,
    plantilla `@for` con `<a class="rt-link">` o texto.
  - Sustituir las seis interpolaciones por `<app-rich-text [text]="…" />`.
  - Estilo: `color: inherit` + subrayado, `text-underline-offset`, foco visible
    con `--color-brand`; en burbujas propias hereda el color del texto.

## Seguridad

Amenaza: un cliente manda texto con HTML o `javascript:` para ejecutar código
en la sesión del equipo. Mitigación: interpolación de Angular (escapa), `href`
construido solo con esquemas permitidos y además saneado por Angular,
`rel="noopener noreferrer"` contra `window.opener`.

## Observabilidad

No aplica: no hay errores de servidor nuevos.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Falsos positivos (p. ej. "1.5" o "S.A.") | Solo `www.` o esquema explícito; correos con TLD ≥ 2 letras |
| Romper saltos de línea | Host con `display: contents`; C5 asegura que el texto no cambia |
| Plantilla con espacios extra en `pre-wrap` | Componente en una sola línea en las plantillas |

## Estrategia de pruebas

- Unitarias: `linkify.spec.ts` (C1–C5, C6 lógica), `rich-text.spec.ts` (C6, C7),
  caso en `inbox` si hay spec que monte la conversación; si no, en `rich-text`.
- e2e: no aplica (no cambia flujos).
- Manual: C11 en Android **[usuario]**.

## Fases

1. Detector + componente + uso en las seis vistas (una sola fase desplegable).

## ADRs

- No aplica.
