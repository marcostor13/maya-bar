# HU70 · plan
1. Campos de puntaje en Customer y Lead; acción de créditos `scoring`.
2. Reglas puras + parser del JSON de la IA, con unitarias.
3. `LeadScoringService` (escucha mensajes entrantes, reserva atómica, reglas + IA, copia a oportunidades, evento `score_changed`) y `ScoringModule` con endpoint de recálculo.
4. Filtros `heat` y `sort` en leads y customers.
5. Disparador y condición en automatizaciones.
6. e2e por el chat web (HU69) con la IA simulada.
7. Frontend: `app-score-badge`, Seguimiento, Contactos, editor de automatizaciones; specs y build.
