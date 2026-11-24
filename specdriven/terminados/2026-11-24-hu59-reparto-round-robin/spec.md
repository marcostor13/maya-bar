# HU59 — Reparto automático round-robin · Especificación

Historia: `backlog/hu59-reparto-round-robin.md` · Fecha: 2026-11-24 · Estado: aprobada

## Objetivo

Que las oportunidades y los contactos nuevos sin responsable se repartan solos entre los vendedores disponibles, con carga justa y sin esperas.

## Usuarios

- Jefe de ventas (TENANT_ADMIN / MANAGER): define reglas, grupos y modos.
- Vendedor: marca si está disponible y su horario; recibe aviso al asignársele.

## Alcance

- Incluye:
  - Reglas de reparto por origen: cualquiera, canal/origen del contacto (`source`: whatsapp, form, api…), formulario concreto u origen de la oportunidad (`Lead.source`). Se aplica la primera regla activa que coincide (orden editable).
  - Modos: turno rotativo, el que tenga menos oportunidades abiertas, ponderado (peso por vendedor).
  - Disponibilidad por usuario: interruptor "Disponible" y horario opcional (días y horas, Lima).
  - Sin respuesta en X minutos (por regla): el lead pasa al siguiente o vuelve a la bolsa, con aviso push.
  - Contacto con dueño: la oportunidad nueva va a ese dueño, sin repartir.
  - Bitácora: actividad `assignment` en la oportunidad o el contacto y colección `routing_assignments`.
- **Fuera de alcance:** reparto de conversaciones sin contacto, territorios y SLA por etapa.

## Requisitos (EARS)

- **R1** — Cuando se crea una oportunidad sin responsable o un contacto sin responsable que coincide con una regla activa, el sistema debe asignarlo a un vendedor del grupo según el modo.
- **R2** — Si un vendedor no está disponible (interruptor apagado, fuera de su horario o inactivo), entonces no debe recibir asignaciones.
- **R3** — Si nadie del grupo está disponible, entonces el elemento queda en la bolsa y se registra el motivo.
- **R4** — Cuando pasa el tiempo de respuesta de la regla sin actividad del responsable en la oportunidad (los contactos no tienen tiempo de respuesta), el sistema debe pasarlo al siguiente disponible (o a la bolsa, según la regla), avisar por push y registrarlo.
- **R5** — Cuando la oportunidad es de un contacto con dueño, el sistema debe dársela a ese dueño.
- **R6** — Multitenant; solo TENANT_ADMIN/MANAGER editan reglas; cada usuario cambia su propia disponibilidad.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Con 3 vendedores en turno rotativo, 6 oportunidades nuevas quedan 2, 2 y 2 | e2e |
| C2 | R2 | Un vendedor no disponible no recibe oportunidades | e2e |
| C3 | R4 | Sin respuesta en 15 min, pasa al siguiente y queda la entrada en la bitácora | e2e con reloj simulado |

## Supuestos

- "Responder" = una actividad (nota, llamada, tarea, cambio de etapa…) registrada por el responsable en la oportunidad después de asignársela.
- Horario en America/Lima.

## Preguntas abiertas

- ninguna
