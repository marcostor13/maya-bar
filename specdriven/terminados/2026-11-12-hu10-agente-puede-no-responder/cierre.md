# HU10 — El agente IA puede decidir no responder · Cierre

- **Cerrada:** 2026-11-12
- **Estado:** Terminada con pendientes del usuario (prompt de Sovereign tras el deploy y prueba real)
- **Verificación (spec-verifier):** no ejecutado: el modo automático bloqueó el lanzamiento (un hook de context-mode modifica la llamada). Autoverificación: 8 CUMPLE · 1 [usuario].
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md` · Prompt: `prompt-sovereign-v2.2.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Sección `--- NO RESPONDER ---` solo con `allowSilence` | CUMPLE | `ai-agents.service.ts` `buildSilencePromptSection`; spec "C1: enseña la marca solo cuando se permite callar" |
| C2 | La marca devuelve `silent` con motivo, sin respaldo | CUMPLE | `generateAnswer` (retorno temprano con `silent`); specs C2 (con y sin texto) |
| C3 | Vacío sin marca → respaldo | CUMPLE | spec "C3: una respuesta vacía sin marca usa el respaldo" |
| C4 | Derivación gana al silencio (también archivos, fotos, citas) | CUMPLE | specs "C4: la derivación gana…" y "enviar un archivo gana al silencio" |
| C5 | Sin permiso: se quita la marca y responde texto o respaldo | CUMPLE | specs C5 (dos casos) |
| C6 | `runAgent` con silencio: no envía, nota interna, apaga "escribiendo…", marca `agentSilent` | CUMPLE | `conversations.service.ts` `runAgent`; `conversations.email.spec.ts` "C6: si calla…" |
| C7 | Sin permiso en el primer mensaje ni dos seguidas; tras responder, sí | CUMPLE | `runAgent` (`allowSilence`); spec "C7: no se permite callar…" (`[false, true, false, true]`) |
| C8 | Playground: `silent` como anotación; tras un silencio no vuelve a callar ni manda el turno vacío | CUMPLE | `testChat`; `ai-agents.ts` (nota "No respondería"); specs C8 (3) |
| C9 | Prueba real con el agente de Sovereign tras el deploy **[usuario]** | NO VERIFICADO | pendiente |

## Qué se implementó

- Marca `{{NO_RESPONDER:motivo}}` (texto, funciona con todos los proveedores y canales); se elimina siempre.
- Instrucción automática en el prompt de sistema cuando se permite callar.
- `Conversation.agentSilent`; nota interna "El agente IA no respondió: <motivo>" y log con ids.
- Playground: anotación "No respondería: motivo", sin burbuja vacía.
- Texto nuevo de la sección 8.4 del prompt de Sovereign (`prompt-sovereign-v2.2.md`).

## Lo que tiene que hacer el usuario

- **Después del deploy** (no antes): cambiar la sección 8.4 del prompt del agente de Sovereign Capital con el texto de `prompt-sovereign-v2.2.md` y probarlo en el playground.
- Comprobar en producción que una promoción ajena o un "gracias" tras despedirse no reciben respuesta y dejan la nota en el hilo.

## Pruebas

- `npm run verify` (2026-11-12) → todo OK (unitarias backend 1565/1565, e2e de API 81/81, e2e de navegador 22/22).
- `npx jest src/ai-agents/ai-agents.service.spec.ts` → 61/61.

## Pendientes, riesgos y notas

- El agente podría callar de más; lo limitan las reglas (nunca el primer mensaje ni dos seguidas) y la nota visible para el equipo.
- Sin verificación independiente (bloqueo del modo automático).
