# HU59 — Reparto automático round-robin

## Historia

**Como** jefe de un equipo de ventas,
**quiero** que los leads y las conversaciones nuevas se repartan solos entre los vendedores disponibles,
**para** que nadie espere y la carga sea justa.

## Contexto (estado actual)

- Existe la bolsa de oportunidades: tomar, soltar, derivar y reasignar, con dueño por contacto (`Customer.ownerId`) y por oportunidad. Ver `docs/reparto-de-leads.md`.
- No hay asignación automática (no se encontró `round robin` ni `autoAssign`).

## Propuesta

1. Reglas de reparto por origen (canal, cuenta de WhatsApp, formulario o campaña), con su grupo de vendedores y su modo:
   - Turno rotativo.
   - El que tenga menos abiertas.
   - Ponderado.
2. Solo reparte a vendedores **disponibles**: un interruptor "Disponible" en el perfil y un horario opcional.
3. Si el dueño no responde en X minutos, el lead vuelve a la bolsa o pasa al siguiente, con aviso push.
4. Un contacto que ya tiene dueño vuelve a su dueño, no se reparte de nuevo.
5. Bitácora de cada asignación automática.

## Criterios de aceptación (borrador)

- C1: con 3 vendedores en turno rotativo, 6 leads nuevos quedan 2 y 2 y 2.
- C2: un vendedor no disponible no recibe leads.
- C3: sin respuesta en 15 minutos, el lead pasa al siguiente y queda la entrada en la bitácora.
