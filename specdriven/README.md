# specdriven

Kit portable de **Spec-Driven Development** para trabajar con agentes de IA
(Claude Code) de forma repetible: cada historia pasa por especificación →
plan → tareas → implementación → verificación independiente → archivo.

No depende del stack. Lo único propio de cada proyecto está en `config.md`.

## Estructura

```
specdriven/
├── README.md              este archivo
├── PROCESO.md             el flujo, paso a paso (lo que sigue el agente)
├── BUENAS-PRACTICAS.md    estándar de ingeniería que se aplica en cada historia
├── config.md              ← lo único que se adapta por proyecto
├── plantillas/            spec.md · plan.md · tasks.md · cierre.md · adr.md
├── backlog/               historias pendientes (hu1.md, hu2.md…) — las escribe el usuario
├── en-curso/              historia en trabajo: huN-<slug>/{spec,plan,tasks}.md
├── terminados/            historias cerradas: AAAA-MM-DD-huN-<slug>/ + índice
├── decisiones/            ADRs (decisiones de arquitectura) que salen de las historias
├── claude/                fuente de la skill y del agente verificador
└── instalar.sh            copia skill y agente a .claude/ del proyecto
```

## Uso

- Escribe una historia en `backlog/huN.md` (texto libre; mejor si dice el
  *para qué*).
- Pide: **"implementa el backlog"**, **"siguiente HU"** o **"implementa la hu3"**.
- El agente sigue `PROCESO.md` y, al terminar, la historia aparece en
  `terminados/` con el detalle de lo hecho, la fecha y el veredicto del
  verificador.

## Instalar en otro proyecto

1. Copia la carpeta `specdriven/` a la raíz del proyecto.
2. Vacía `backlog/`, `en-curso/`, `terminados/` (deja `terminados/README.md`
   con la tabla vacía) y `decisiones/`.
3. Edita `config.md`: comandos de verificación, convenciones y reglas propias.
4. Ejecuta `bash specdriven/instalar.sh` (copia la skill y el agente a `.claude/`).
5. Añade a `CLAUDE.md` (o `AGENTS.md`) del proyecto:
   ```
   ## Backlog
   Para implementar historias usa SIEMPRE la skill `specdriven` (proceso en `specdriven/PROCESO.md`).
   ```

Si cambias la skill o el agente, edita la fuente en `specdriven/claude/` y
vuelve a ejecutar `instalar.sh`.
