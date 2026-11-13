# HU9 — Formularios de crear/editar en pantalla completa en lugar del panel lateral

## Historia

**Como** usuario de Maya CRM,
**quiero** que agregar o editar registros se haga en una pantalla propia y no
en el panel lateral derecho (drawer),
**para** ver bien toda la información, que hoy no cabe ni se aprecia en el
panel.

## Contexto

- Páginas que hoy usan drawer para crear/editar (`frontend/src/app/pages/`):
  ai-agents, campaigns (editor y destinatarios), customers (y su
  importación), forms, leads (y config. de etapas), links (y lotes), lists,
  locals, menu, prospecting, settings (llamadas y correo), templates, users,
  visits, whatsapp-templates, events (diseñador de invitaciones).
- Choca con la regla actual de `CLAUDE.md` ("Drawers para formularios
  complejos"): la spec debe definir el nuevo patrón (rutas `/…/nuevo` y
  `/…/:id/editar`, volver al listado, aviso de cambios sin guardar) y
  actualizar `CLAUDE.md` y `docs/kitui.md`.
- Por decidir en la spec: si los modales simples (≤5 campos) se mantienen y
  si se migra todo de una vez o por fases (empezando por los formularios con
  más información, p. ej. agentes IA y campañas).
