# HU9 — Formularios de crear/editar en pantalla completa · Tareas

- [x] T1 — Componente `app-form-page` + pruebas → C1, C2, C3, C7 · prueba: `shared/form-page.spec.ts`
- [x] T2 — Migrar ai-agents (editor) como referencia → C4, C5 · prueba: specs de ai-agents
- [x] T3 — Migrar customers (contacto, importación), lists (lista, miembros), users → C4, C5 · prueba: specs de esas páginas (incl. `dirty` en users)
- [x] T4 — Migrar campaigns (editor, destinatarios), forms (editor, envíos), templates (mensajes, correo), whatsapp-templates → C4, C5 · prueba: specs
- [x] T5 — Migrar leads (ficha, formulario, etapas), links (link, lotes), prospecting, visits → C4, C5 · prueba: specs
- [x] T6 — Migrar settings (correo, llamadas), locals, menu → C4, C5 · prueba: specs. events (diseñador) no se migra: sus `d-drawer` son paneles de herramientas en móvil, no formularios de un registro (fuera de alcance)
- [x] T7 — Documentación: `CLAUDE.md` y `docs/kitui.md` → C8
- [x] T8 — Verificación mecánica `npm run verify` (2026-11-12, tras las correcciones de T9b): lint y build backend OK · unitarias backend 1565/1565 · e2e de API 81/81 · unitarias frontend 74 archivos OK · build frontend OK · e2e de navegador 22/22 → C6
- [x] T9 — Verificación independiente (`spec-verifier`): 6 CUMPLE · 2 PARCIAL (C2, C3) · C9 [usuario]
- [x] T9b — Correcciones: atrás con cambios pregunta y repone `?form=`; cerrar hace `location.back()` (sin entrada vacía); `queryParamMap` en vez de `includes`; ficha→edición reemplaza la entrada (`urlKey` en la edición de leads); trampa de foco y foco de vuelta al abrir; zonas seguras laterales · prueba: `form-page.spec.ts` 7/7
- [x] T10 — Archivada en `terminados/2026-11-12-hu9-formularios-pantalla-completa/`
