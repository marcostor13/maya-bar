# HU69 — Chat web para la página del cliente

## Historia

**Como** empresa con página web,
**quiero** pegar un código y tener un chat en mi web atendido por mi agente de IA y mi equipo,
**para** captar a quien no escribe por WhatsApp.

## Contexto (estado actual)

- No hay un canal de chat web; la bandeja reúne WhatsApp, Instagram, Messenger y email.
- Cliengo vive de este canal en LATAM.

## Propuesta

1. Script embebible (`<script src=…/widget.js data-key=…>`), liviano, con el color y el logo de la empresa:
   - Burbuja, formulario opcional de nombre y teléfono, y opción "Seguir por WhatsApp".
2. Nuevo canal `web` en conversaciones, en tiempo real (el mismo socket de HU23), con el agente IA y la derivación a humano.
3. Identificación del visitante por cookie. Si deja teléfono o email, se fusiona con el contacto existente.
4. Dominios permitidos por empresa (CORS y origen), con throttling y protección anti-spam.

## Criterios de aceptación (borrador)

- C1: un mensaje desde el widget aparece en la bandeja y la respuesta llega al widget en menos de 2 s (e2e).
- C2: el widget no carga en un dominio que no esté en la lista permitida.
