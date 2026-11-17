# HU12 — Links clicables en los mensajes de los chats · Cierre

- **Cerrada:** 2026-11-14
- **Estado:** Terminada con pendiente del usuario (prueba en la app Android, C11)
- **Verificación (spec-verifier):** no ejecutado: el modo automático bloqueó el lanzamiento dos veces (un hook de context-mode modifica la llamada). Autoverificación: 10 CUMPLE · 1 [usuario].
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | URL `http(s)` → link a esa URL | CUMPLE | `frontend/src/app/shared/linkify.ts`; `linkify.spec.ts` "C1…" (2) |
| C2 | `www.` → `https://www.…` | CUMPLE | `linkify.spec.ts` "C2…" (2, incluido "www." suelto) |
| C3 | Correo → `mailto:` sin el punto final | CUMPLE | `linkify.spec.ts` "C3…" |
| C4 | Puntuación y `)` de la frase fuera; `(b)` de la URL dentro | CUMPLE | `trimUrl`; `linkify.spec.ts` "C4…" (2) |
| C5 | Varias URLs y saltos de línea: texto idéntico | CUMPLE | `linkify.spec.ts` "C5…"; `rich-text.spec.ts` "mantiene los saltos de línea" |
| C6 | HTML, `javascript:` y `data:` no generan links ni elementos | CUMPLE | `linkify.spec.ts` "C6…" (2); `rich-text.spec.ts` "C6…"; e2e (sin `<b>` en la burbuja) |
| C7 | `<a href target="_blank" rel="noopener noreferrer">`; `mailto` sin `target` | CUMPLE | `rich-text.spec.ts` "C7…" (2) |
| C8 | La bandeja pinta el `<a>`; las seis vistas usan el componente | CUMPLE | e2e `inbox.e2e.ts` "un link del cliente se ve como link…"; `app-rich-text` en `inbox.ts` (burbuja, adjuntos, nota del sistema), `ai-agents.ts`, `leads.ts`, `contact-care.ts` |
| C9 | Estilo solo con variables | CUMPLE | `rich-text.ts` (`--color-brand`, `--rich-text-link`); burbuja de marca del playground con `--rich-text-link: inherit` |
| C10 | Análisis en un `computed` | CUMPLE | `RichText.segments = computed(...)`, `OnPush` |
| C11 | En Android el link abre el navegador del sistema **[usuario]** | NO VERIFICADO | pendiente |

## Qué se implementó

- `linkify()` (pura): detecta URLs `http(s)://`, `www.` y correos; recorta la puntuación final y los `)` sin abrir; solo genera `https?:`/`mailto:`.
- Componente `<app-rich-text [text]>` (sin `innerHTML`, host `display: contents` para heredar `pre-wrap`).
- Aplicado en la bandeja (mensajes, lectura de adjuntos, notas del sistema), playground de agentes IA, notas de leads y seguimiento de contactos.
- e2e nuevo en `frontend/e2e/inbox.e2e.ts` (siembra un mensaje con link).

## Lo que tiene que hacer el usuario

- Tras el deploy, en la app Android: abrir una conversación con un link, pulsarlo y comprobar que se abre en el navegador del teléfono y que al volver la app sigue donde estaba.

## Pruebas

- `npm run verify` (2026-11-14) → todo OK: lint y build backend · unitarias backend 1565/1565 · e2e de API 81/81 · unitarias frontend 76 archivos / 772 pruebas · build frontend · e2e de navegador 23/23.
- `linkify.spec.ts` + `rich-text.spec.ts` → 18/18.

## Pendientes, riesgos y notas

- Los correos de la bandeja se siguen mostrando como texto (el HTML del correo está fuera de alcance); sus URLs ya son clicables.
- Sin verificación independiente (bloqueo del modo automático).
