# 0001 — Papelera de conversaciones con marca y filtro en el esquema

- **Fecha:** 2026-11-08 · **Estado:** aceptada
- **Historia:** hu4

## Contexto

Eliminar una conversación debe ser recuperable 30 días. La colección
`conversations` la consultan al menos seis servicios (bandeja, asignación,
paneles, analítica, conversiones, recuperación) y tiene un índice único
`{channel, accountId, contact}` que impediría crear un chat nuevo con el mismo
contacto mientras el viejo siga en la papelera.

## Decisión

Marca `inTrash` en la conversación, un middleware de Mongoose que excluye la
papelera en todas las consultas salvo que se pida `withTrashed` o se filtre por
`inTrash`, e índice único parcial `{inTrash: false}`.

## Alternativas consideradas

- Mover conversación y mensajes a colecciones de papelera — copia masiva de
  mensajes y restauración más frágil.
- Añadir el filtro a mano en cada consulta — fácil de olvidar en servicios
  futuros; un olvido muestra chats eliminados.

## Consecuencias

- Positivas: un solo punto de verdad; los servicios existentes no cambian.
- Negativas / costes: comportamiento implícito (documentado en el esquema);
  migración del índice al arrancar.
