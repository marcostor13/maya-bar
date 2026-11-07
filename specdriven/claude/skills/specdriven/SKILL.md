---
name: specdriven
description: Proceso Spec-Driven Development para implementar historias del backlog (specdriven/backlog) - spec.md, plan.md y tasks.md, implementación por tareas, verificación mecánica e independiente con el agente spec-verifier, y archivo en specdriven/terminados con fecha y detalle. Úsala cuando el usuario diga "backlog", "siguiente HU", "implementa la hu…", "historia" o similar.
---

# specdriven

Sigue **`specdriven/PROCESO.md`** al pie de la letra, sin saltar pasos.

Antes de empezar lee, en este orden:
1. `specdriven/config.md` — comandos y reglas de este proyecto.
2. `specdriven/BUENAS-PRACTICAS.md` — estándar de ingeniería.
3. `specdriven/PROCESO.md` — el flujo.

Rutas:
- Historias pendientes: `specdriven/backlog/`
- En curso: `specdriven/en-curso/huN-<slug>/` (`spec.md`, `plan.md`, `tasks.md`)
- Cerradas: `specdriven/terminados/AAAA-MM-DD-huN-<slug>/` + índice `README.md`
- Plantillas: `specdriven/plantillas/` · ADRs: `specdriven/decisiones/`

Verificación independiente: Agent tool con `subagent_type: spec-verifier`,
pasándole solo la ruta de la historia y de su carpeta en `en-curso/`.

Si el usuario pide varias historias, ciérralas una a una (spec → … → archivo)
antes de pasar a la siguiente.
