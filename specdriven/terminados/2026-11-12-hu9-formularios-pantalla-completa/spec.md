# HU9 — Formularios de crear/editar en pantalla completa · Especificación

Historia: `backlog/hu9.md` · Fecha: 2026-11-12 · Estado: aprobada

## Objetivo

Los formularios de alta y edición se abren hoy en un panel lateral de
480–600 px donde los campos largos (prompts, cuerpos de campaña, plantillas)
no se aprecian. Se pasan a una pantalla propia, a todo el ancho, con la misma
lógica de guardado.

## Usuarios

- Cualquier usuario del CRM que crea o edita registros.

## Alcance

- Incluye: un componente común `app-form-page` y la migración a él de los
  paneles laterales (drawers) de las páginas de la historia:
  ai-agents (editor), campaigns (editor y destinatarios), customers (contacto
  e importación), forms (editor y envíos), leads (ficha, formulario y
  configuración de etapas), links (link y lotes: nuevo y detalle), lists
  (lista y miembros), locals, menu, prospecting (ficha), settings (correo y
  llamadas), templates (mensajes y correo), users, visits, whatsapp-templates
  y events (diseñador de invitaciones), en cuanto sean paneles laterales.
- Reglas nuevas en `CLAUDE.md` y `docs/kitui.md`.
- **Fuera de alcance:**
  - Modales centrados simples (≤ 5 campos) y diálogos de confirmación: se
    quedan como modales.
  - Paneles que no son formularios de un registro: playground de agentes,
    papelera y bloqueados de la bandeja, centro de notificaciones/push,
    carrito del menú público.
  - Rutas propias `/…/nuevo` y `/…/:id/editar` con componentes separados
    (ver supuestos).
  - Cambiar campos, validaciones o endpoints de los formularios.

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando el usuario abre crear o editar en una página migrada, el
  sistema debe mostrar el formulario a pantalla completa (todo el ancho y alto
  disponible) con barra superior: volver, miga con la pantalla de origen,
  título y acciones (guardar, etc.).
- **R2** — Cuando el formulario está abierto, el sistema debe añadir
  `?form=<clave>` a la URL; cuando el usuario pulsa atrás en el navegador o el
  móvil, el sistema debe cerrar el formulario y volver al listado sin salir de
  la página.
- **R3** — Si hay cambios sin guardar y el usuario pulsa volver, atrás o ESC,
  entonces el sistema debe pedir confirmación (`ConfirmService`) antes de
  descartarlos; si no hay cambios, cierra sin preguntar.
- **R4** — Cuando el usuario guarda, el sistema debe comportarse como antes
  (mismo endpoint, mismo toast, mismo refresco del listado) y cerrar la
  pantalla.
- **R5** — El listado conserva su estado (filtros, página, scroll) al volver.

No funcionales:
- **R6 (accesibilidad)** — `role="dialog"`, `aria-modal`, título enlazado
  con `aria-labelledby`, foco en el título al abrir, botón volver con
  `aria-label`, navegación con teclado.
- **R7 (móvil)** — En ≤ 768 px: márgenes de 16 px, acciones a todo el ancho,
  respeta las zonas seguras (notch) y no queda tapada por la barra inferior.
- **R8 (diseño)** — Usa variables de `styles.scss` y clases base; sin
  `max-width` en la pantalla.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R6 | Dado `app-form-page` abierto, entonces muestra título, miga, subtítulo, acciones y contenido, con `role="dialog"` y `aria-labelledby` | unitaria `form-page.spec.ts` |
| C2 | R2 | Al abrir pone `?form=<clave>`; al volver lo quita; si la URL pierde `?form=` (atrás del navegador), se cierra | unitaria `form-page.spec.ts` |
| C3 | R3 | Con cambios sin guardar, volver, ESC o atrás del navegador preguntan (si se sigue editando, atrás repone `?form=`); cancelar mantiene abierto; sin cambios cierra sin preguntar | unitaria `form-page.spec.ts` |
| C4 | R1, R4 | Cada página del alcance abre su formulario de crear/editar en `app-form-page` (ya no `.drawer`) y guarda como antes | revisión de código (`grep`) + unitarias existentes de cada página en verde |
| C5 | R3 | Los formularios de crear/editar pasan `dirty` comparando con el estado al abrir | unitaria en al menos una página (users) + revisión |
| C6 | R4, R5 | Los flujos e2e de navegador existentes (contactos, listas, usuarios) siguen pasando | `npm run verify` (e2e de navegador) |
| C7 | R7, R8 | En móvil la pantalla usa 16 px de margen y respeta zonas seguras; sin `max-width` | revisión de CSS de `form-page.ts` |
| C8 | — | `CLAUDE.md` y `docs/kitui.md` describen el patrón nuevo | revisión |
| C9 | — | Revisión visual en el navegador real de 2–3 formularios **[usuario]** | manual |

## Supuestos y decisiones por defecto

- **Pantalla completa sobre la página, no rutas separadas.** Pasar cada
  formulario a un componente con ruta propia obligaría a reescribir ~20
  páginas (el estado del formulario vive en el componente de la página). Con
  `app-form-page` el formulario ocupa toda la pantalla, tiene URL
  (`?form=`) y atrás del navegador funciona, sin riesgo para la lógica de
  guardado. Recargar con `?form=` en la URL abre el listado (aceptado).
- Los modales simples (≤ 5 campos) se mantienen.
- La ficha de un registro que se abre en panel (lead, prospecto, envíos de un
  formulario, detalle de lote, miembros de lista, destinatarios de campaña)
  también pasa a pantalla completa, porque la historia los nombra.
- Se migra todo de una vez.

## Preguntas abiertas

- Ninguna.
