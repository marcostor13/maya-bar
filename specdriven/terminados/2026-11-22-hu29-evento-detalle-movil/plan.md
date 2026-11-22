# HU29 — Detalle del evento en el móvil · Plan técnico

## Estado actual

- `event-detail.store.ts:135` `saveEvent` guarda form + medios + preguntas; no hay detección de cambios.
- `tabs/event-general-tab.ts:64-70`: botones Cancelar/Guardar solo en General. El formulario tiene `description` (store l.101), pero no hay campo para editarla.
- `tabs/event-media-tab.ts:100-101`: borrar con `opacity:0` hasta el hover, 24 px y sin confirmación. Las líneas 77-82 tienen una pista para guardar desde General.
- `tabs/event-form-tab.ts`: subir y bajar ya existen (`moveUp`/`moveDown`); `.btn-icon-xs` mide 28 px. En móvil el tipo ya pasa a ancho completo (`width:100% !important`).
- `event-detail.ts:86-133`: 9 pestañas en scroll horizontal. La pestaña inicial es siempre General salvo `?tab=`.
- Ruta `events/:id` (`app.routes.ts:118`) sin `canDeactivate`.

## Diseño

- **Store**:
  - `formValue = toSignal(form.valueChanges)`.
  - `savedSnapshot` signal.
  - `currentSnapshot()` con `snapshotOf({form, previewUrl, mediaFiles, formFields})`.
  - `dirty = computed(...)` y `markSaved()`.
  - `markSaved()` se llama tras cargar, tras guardar (antes de navegar al crear) y al iniciar un evento nuevo.
- **Pestaña inicial**: función pura `initialTab(ev, today)` en `event-tabs.ts`, junto con `TAB_GROUP` y `groupOf(tab)`.
- **Detalle**:
  - Segmentado Configurar/Operar visible solo en ≤ 768 px y en eventos existentes. Las pestañas de otro grupo llevan la clase `.tab-other-group` (`display:none` en móvil).
  - Barra `.save-bar` con `position: sticky; bottom: calc(var(--bottom-nav-height) + var(--safe-bottom))` cuando la pestaña es general/media/form, o invitation si el evento es nuevo.
  - `canLeave()` pide confirmación si hay cambios; `beforeunload` también si hay cambios.
- **Guard**: `canDeactivate: [(c: EventDetailComponent) => c.canLeave()]` en la ruta.
- **General**: textarea de descripción; se quitan los botones (ahora están en la barra).
- **Medios**: `removeMedia` con `ConfirmService`; `@media (hover: none)` → botón visible de 36 px. Se quita la pista de guardar.
- **Formulario**: `.btn-icon-xs` de 40 px en `(hover: none)` y ≤ 768 px. Se quita la pista.
- **Colores**: `#fff`/`#fafafa` tocados → `--color-white`/`--color-bg-app`.

## Seguridad

Solo cliente; no cambia la API ni los permisos.

## Observabilidad

No aplica (solo interfaz).

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| El guard salta al crear y navegar a `/events/:id` | `markSaved()` antes de navegar |
| La barra sticky queda bajo la barra inferior | offset con `--bottom-nav-height` y `--safe-bottom` |

## Estrategia de pruebas

- Unitarias:
  - `initialTab` y grupos.
  - `dirty` del store (cambio, guardar, cargar).
  - `canLeave` con ConfirmService simulado.
  - Borrado de medio con confirmación.
- Manual (CSS): 360 px.

## Fases

1. Única: todo lo anterior.

## ADRs

- No aplica.
