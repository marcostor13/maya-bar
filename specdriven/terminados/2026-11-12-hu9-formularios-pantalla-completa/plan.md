# HU9 — Formularios de crear/editar en pantalla completa · Plan técnico

## Estado actual

- Cada página define su propio `.overlay` + `aside.drawer` con CSS copiado
  (p. ej. `pages/leads/leads.ts:371,580,776-784`,
  `pages/ai-agents/ai-agents.ts:245-745,826-840`). ~40 archivos usan
  `class="drawer"` u `overlay`.
- ESC se maneja en cada página con `@HostListener('document:keydown.escape')`.
- `CLAUDE.md` pide "Drawers para formularios complejos".

## Diseño

- **Componente** `frontend/src/app/shared/form-page.ts` (`app-form-page`):
  `position: fixed; inset: 0` (encima del shell, incluida la barra inferior
  móvil), barra superior con volver/miga/título/acciones (`[formActions]`),
  cuerpo con scroll propio, padding 32×40 (16 en móvil). Entradas: `title`,
  `subtitle`, `backLabel`, `dirty`, `urlKey`; salida `closed`. Gestiona
  `?form=`, ESC y la confirmación de cambios sin guardar. Helper
  `snapshotOf()`.
- **Migración por página**: sustituir `overlay`+`aside.drawer`+cabecera por
  `<app-form-page>`; botones del pie al slot `formActions`; `urlKey` =
  `'nuevo'` o el id; `dirty` = `snapshotOf(form) !== snapshotAlAbrir` en los
  formularios; quitar la rama del drawer en el ESC de la página; borrar el CSS
  de drawer que quede sin uso; ajustar sus specs si buscaban `.drawer`.
- **Datos / API / integraciones**: no aplica.

## Seguridad

No aplica (solo presentación). Sin cambios de permisos ni datos.

## Observabilidad

No aplica.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Romper el guardado al mover botones | Solo se mueve marcado; specs de cada página y e2e de navegador |
| ESC cierra dos veces (página + componente) | Se quita la rama del drawer en el ESC de la página; el componente para la propagación |
| Muchos archivos a la vez | Migración en lotes por páginas, cada lote con su `ng test` |

## Estrategia de pruebas

- Unitarias del componente (C1–C3); una prueba de `dirty` en users (C5);
  suites existentes de cada página.
- e2e de navegador (`npm run verify`) para contactos, listas y usuarios (C6).
- Manual: C9 **[usuario]**.

## Fases

1. Componente + pruebas.
2. Migración de páginas (en lotes) + documentación.

## ADRs

- `decisiones/0003-formularios-pantalla-completa.md`.
