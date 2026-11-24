# HU70 — Puntaje de leads con IA · spec

## Alcance
- Puntaje 0–100 en el contacto (`score`, `scoreLabel` hot/warm/cold, `scoreReason`, `scoreDetail`, `scoredAt`), copiado a sus oportunidades para ordenar Seguimiento.
- **Reglas (0–50)** (`src/scoring/score-rules.ts`): origen, mensajes de los últimos 7 días, rapidez de respuesta, aperturas y clics de email (HU61, últimos 30 días), avance en el embudo / ganada.
- **IA (0–50)**: lee hasta 20 mensajes de la última conversación y devuelve intención, presupuesto, urgencia, objeciones y un motivo de una línea. Cobra créditos con la acción nueva `scoring` (1 crédito). Sin IA o sin saldo, queda el puntaje por reglas.
- Recalcula con cada mensaje entrante (MessageEvents) y a pedido (`POST /scoring/customers/:id`). Como máximo 1 cada 10 min por contacto, con una reserva atómica sobre `scoredAt`.
- Caliente ≥ 70, tibio ≥ 40, frío < 40.
- Seguimiento: insignia en las tarjetas y en la lista, motivo en la ficha, filtro por temperatura (`heat` en `/leads/board`) y "Mejores primero". Contactos: insignia, filtro y orden. API: `heat` y `sort=score` en `/leads` y `/customers`.
- Automatizaciones: disparador `score_reached` (al cruzar el umbral hacia arriba) y condición `score_at_least`.

## Criterios
- C1: una conversación con "¿cuánto cuesta? lo necesito esta semana" sube el puntaje y muestra el motivo (modelo simulado).
- C2: el recálculo no pasa de 1 por contacto cada 10 minutos.
