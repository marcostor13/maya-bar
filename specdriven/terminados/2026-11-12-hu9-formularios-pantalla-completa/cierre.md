# HU9 — Formularios de crear/editar en pantalla completa · Cierre

- **Cerrada:** 2026-11-12
- **Estado:** Terminada con pendientes del usuario (revisión visual C9)
- **Verificación (spec-verifier):** 1.ª vuelta: 6 CUMPLE · 2 PARCIAL (C2, C3) · C9 [usuario]. C2 y C3 corregidos después (T9b) sin 2.ª vuelta del verificador: el lanzamiento quedó bloqueado por el modo automático (un hook de context-mode modifica la llamada).
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md` · Guía: `guia-migracion.md` · ADR: `../../decisiones/0003-formularios-pantalla-completa.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Pantalla completa con título, miga, acciones, `role="dialog"`, `aria-labelledby` | CUMPLE | `frontend/src/app/shared/form-page.ts` (plantilla); `form-page.spec.ts` "ocupa la pantalla…" |
| C2 | `?form=` al abrir; se quita al volver; atrás cierra | CUMPLE (tras corrección) | `form-page.ts` `pushKey`/`clearUrl` (`location.back()`, sin entrada vacía); edición de leads con `urlKey` `editar-<id>` (`leads.ts`); `form-page.spec.ts` "pone ?form=…" y "el atrás del navegador…" |
| C3 | Con cambios: volver, ESC o atrás preguntan; cancelar mantiene abierto | CUMPLE (tras corrección) | `form-page.ts` `onBrowserBack` (pregunta y repone `?form=`); `form-page.spec.ts` "atrás del navegador con cambios…" |
| C4 | Páginas del alcance en `app-form-page` y guardan como antes | CUMPLE | 25 usos en 21 componentes; sin cambios en llamadas HTTP/toasts (verificador, `git diff`) |
| C5 | `dirty` con foto al abrir | CUMPLE | `snapshotOf`/`isDirty()` en todos los formularios; `users.spec.ts` |
| C6 | e2e de contactos, listas y usuarios siguen pasando | CUMPLE | `npm run verify`: e2e de navegador 22/22 |
| C7 | Móvil 16 px y zonas seguras; sin `max-width` | CUMPLE | `form-page.ts` estilos (ahora también zonas laterales) |
| C8 | `CLAUDE.md` y `docs/kitui.md` describen el patrón | CUMPLE | `CLAUDE.md` "Patrones de formularios"; `docs/kitui.md` §10 |
| C9 | Revisión visual de 2–3 formularios **[usuario]** | NO VERIFICADO | pendiente del usuario |

## Qué se implementó

- Componente `app-form-page` + `snapshotOf()`: pantalla completa con volver, miga, título, subtítulo y acciones; `?form=<clave>` (atrás cierra); confirmación de cambios sin guardar con `ConfirmService` en volver, ESC y atrás; foco atrapado dentro y devuelto al cerrar; móvil con zonas seguras.
- Paneles laterales migrados: ai-agents, campaigns (editor y destinatarios), customers (ficha, formulario, importación), forms (editor y envíos), leads (ficha, formulario, etapas), links (link, lotes), lists (lista y miembros), locals, menu, prospecting, settings (correo y llamadas), message-templates, users, visits, whatsapp-templates.
- events (diseñador de invitaciones) no se migró: sus paneles son herramientas en móvil, no formularios de un registro.
- Reglas nuevas en `CLAUDE.md` y `docs/kitui.md`; ADR 0003.

## Lo que tiene que hacer el usuario

- Revisar en el navegador y en el móvil 2–3 formularios (p. ej. agente IA, contacto, campaña): abrir, editar, pulsar atrás con y sin cambios.
- Aceptar la decisión del ADR 0003: no hay rutas propias `/…/nuevo` ni `/…/:id/editar`; recargar con `?form=` muestra el listado.

## Pruebas

- `npm run verify` (2026-11-12) → lint y build backend OK · unitarias backend 1565/1565 · e2e de API 81/81 · unitarias frontend 74 archivos OK · build frontend OK · e2e de navegador 22/22.
- `npx ng test frontend --include=src/app/shared/form-page.spec.ts` → 7/7.

## Pendientes, riesgos y notas

- 13 de las 21 páginas migradas no tienen spec propia (ai-agents, campaign-recipients, contact-import, customers, forms, lead-stages-config, link-batches, links, prospect-drawer, prospecting, message-templates, visits, whatsapp-templates); se apoyan en `tsc`, revisión del diff y e2e.
- Si un formulario se abre encima de otro que sigue visible, el de abajo se queda sin `?form=` al cerrar el de arriba (caso no usado hoy).
- Sin 2.ª vuelta del verificador sobre las correcciones (bloqueo del modo automático).
