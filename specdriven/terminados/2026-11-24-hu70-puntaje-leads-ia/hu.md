# HU70 — Puntaje de leads con IA

## Historia

**Como** vendedor con muchos leads,
**quiero** ver cuáles tienen más probabilidad de comprar y por qué,
**para** llamar primero a los mejores.

## Contexto (estado actual)

- No hay puntaje (no se encontró `scoring`).
- Ya existen la IA multimodelo, las conversaciones, el origen de campaña, las etapas y la bitácora.

## Propuesta

1. Puntaje de 0 a 100 en dos partes:
   - **Reglas**: origen, respuesta rápida, interacción con email (HU61) y etapa.
   - **Lectura con IA** de la última conversación: intención, presupuesto, urgencia y objeciones, con un resumen de una línea del porqué.
2. Se recalcula con cada mensaje entrante (con un límite de frecuencia) y cuesta créditos (HU43).
3. Orden y filtro por puntaje en Seguimiento y Contactos, y una insignia de "caliente", "tibio" o "frío".
4. El puntaje sirve como disparador y condición en las automatizaciones (HU58).

## Criterios de aceptación (borrador)

- C1: una conversación con "¿cuánto cuesta? lo necesito esta semana" sube el puntaje y muestra el motivo (prueba con el modelo simulado).
- C2: el recálculo no pasa de 1 por contacto cada 10 minutos.
