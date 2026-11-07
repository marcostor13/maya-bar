# Proceso Spec-Driven

La especificación manda. Primero se fija **qué** se cumple y cómo se comprueba,
luego **cómo** se construye, luego las **tareas**. El código se verifica contra
la spec, no contra lo que el agente recuerda haber hecho.

Reglas que nunca se saltan:
- Ningún paso se omite; si uno no aplica, se escribe "no aplica" y por qué.
- Lo no verificado se dice como **NO VERIFICADO**, nunca como hecho.
- Sin commits, deploys ni acciones en servicios externos salvo que el usuario
  lo pida. Credenciales y consolas externas las maneja el usuario.
- Antes de empezar, leer `config.md` y `BUENAS-PRACTICAS.md`.

## 0. Preparar

- Leer `config.md` (comandos, convenciones, reglas del proyecto).
- `git status`: si hay cambios ajenos sin commit, no mezclarlos; avisar.

## 1. Elegir la historia

- La que nombre el usuario; si no, la primera de `backlog/` por orden natural
  (`hu1` < `hu2` < `hu10`). Los archivos que empiezan por `_` no son historias.
- Backlog vacío → decirlo y parar. Una historia por ciclo.
- **Definition of Ready**: la historia dice qué se quiere y para quién (si no
  dice el para qué, inferirlo y anotarlo como supuesto).

## 2. Especificar — `en-curso/huN-<slug>/spec.md`

Con `plantillas/spec.md`:
1. Investigar el código afectado antes de escribir (qué existe, qué falta).
2. Objetivo, usuarios, alcance y **fuera de alcance** explícito.
3. Requisitos `R1…Rn` en EARS ("Cuando <evento>, el sistema debe <respuesta>";
   "Si <error>, entonces…"), incluidos los no funcionales: seguridad,
   rendimiento, accesibilidad, privacidad.
4. Criterios de aceptación `C1…Cn` en Dado/Cuando/Entonces, cada uno ligado a un
   `R`, verificables por prueba automática o, si no se puede, por un paso manual
   descrito. Los que dependan solo del usuario: **[usuario]**.
5. Supuestos y decisiones por defecto; preguntas abiertas.
6. Preguntar al usuario solo si una pregunta abierta bloquea y no tiene un valor
   por defecto razonable. Si no, decidir, anotar y seguir.

## 3. Planificar — `plan.md`

Con `plantillas/plan.md`: estado actual con rutas, diseño (datos, API,
interfaz, integraciones), seguridad (modelo de amenazas breve), migraciones,
observabilidad, riesgos, estrategia de pruebas y **fases** (cada fase deja el
producto funcionando y desplegable). Decisiones de arquitectura relevantes →
ADR en `decisiones/` con `plantillas/adr.md`.

## 4. Tareas — `tasks.md`

Con `plantillas/tasks.md`: tareas pequeñas (≤ medio día), ordenadas por
dependencia, cada una con los criterios que cubre (`→ C2`) y su prueba. Se
marcan `[x]` al terminarlas: la lista es el estado real del trabajo.

## 5. Implementar

- Tarea a tarea, en rebanadas verticales; prueba primero cuando el
  comportamiento está claro (TDD), siempre prueba antes de marcar `[x]`.
- Seguir `BUENAS-PRACTICAS.md` y las convenciones de `config.md`.
- Si cambia el alcance, se actualiza primero `spec.md` (y se dice al usuario).
- Indicaciones para el usuario (configuraciones externas) → documento propio en
  la ruta que indique `config.md`, enlazado desde `cierre.md`.

## 6. Verificar (dos capas)

1. **Mecánica**: los comandos de verificación de `config.md`. Anotar números
   reales (pruebas, fallos). Un fallo se arregla, no se reintenta hasta que pase.
2. **Independiente**: lanzar el agente `spec-verifier` con la ruta de la
   historia y de `en-curso/huN-<slug>/`. Sin pasarle conclusiones propias.
3. PARCIAL o NO CUMPLE en algo que no sea **[usuario]** → corregir y volver a
   verificar. Máximo dos vueltas; lo que quede se documenta como pendiente.

**Definition of Done**: criterios cumplidos o justificados, pruebas verdes,
build limpio, sin secretos ni datos personales en código o logs, documentación
para el usuario si hace falta, verificador ejecutado.

## 7. Archivar

1. Crear `terminados/AAAA-MM-DD-huN-<slug>/` (fecha de cierre).
2. Mover la historia como `hu.md` y los archivos de `en-curso/huN-<slug>/`
   (borrar la carpeta vacía). `git mv` si están versionados.
3. Escribir `cierre.md` con `plantillas/cierre.md`.
4. Añadir la línea al índice `terminados/README.md` (la más reciente arriba).

## 8. Informar

En el idioma del usuario y corto: qué quedó hecho, veredicto del verificador,
qué tiene que hacer el usuario (con enlace), riesgos o pendientes, y que no hay
commit hasta que lo pida. Si pidió seguir, volver al paso 1.
