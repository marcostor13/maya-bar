# 0002 — Audio de las llamadas de WhatsApp directo del navegador a Meta

- **Fecha:** 2026-11-09 · **Estado:** aceptada
- **Historia:** hu6

## Contexto

La Calling API de WhatsApp intercambia el audio por WebRTC (ICE + DTLS-SRTP, con
OPUS). Meta envía en el webhook una oferta SDP `ice-lite` con candidatos en IPs
públicas de su relé, y espera de vuelta una respuesta SDP completa en
`POST /{phone-number-id}/calls`. Las alternativas son terminar el audio en el
navegador de quien atiende o en un servidor de medios propio.

## Decisión

Terminar el audio en el navegador (o en el WebView de la app Android).

El backend solo hace de señalización:
- reenvía la oferta;
- recibe la respuesta del navegador;
- envía las acciones a Meta;
- lleva el estado de la llamada.

Cada SDP se envía completo, tras reunir los candidatos ICE, porque la API no
admite trickle ICE.

## Alternativas consideradas

- Servidor de medios propio (mediasoup o Janus): no aporta nada sin grabación ni
  transferencia, que están fuera de alcance. Añade infraestructura con puertos
  UDP expuestos y coste.
- SIP hacia una centralita: está fuera de alcance (es telefonía convencional).

## Consecuencias

- **Positivas:**
  - sin infraestructura nueva;
  - latencia mínima;
  - el backend nunca toca el audio, así que no hay datos de voz que proteger.
- **Negativas:**
  - quien atiende necesita un navegador con micrófono y salida UDP. En redes
    muy restrictivas haría falta un TURN, que queda configurable;
  - la grabación o la transferencia exigirán revisar esta decisión.
