# HU2 — Origen de campaña en conversaciones y recuperación por campaña · Especificación

Historia: `specdriven/backlog/hu2.md` · Fecha: 2026-11-06 · Estado: aprobada (decisiones por defecto)

## Objetivo

Que el equipo vea de qué campaña viene cada conversación (anuncio de Meta o
campaña masiva enviada desde Maya), pueda filtrar la bandeja por campaña y
lanzar una recuperación de clientes solo con las conversaciones de una campaña.

## Usuarios

- **Equipo de ventas**: reconoce el origen del chat y filtra por campaña.
- **Administrador / marketing**: recupera clientes de una campaña concreta.

## Alcance

- Incluye:
  - Origen "anuncio de Meta" (Click-to-WhatsApp): ya se guarda `adReferral`;
    se convierte en origen de campaña (nombre = titular del anuncio).
  - Origen "campaña de Maya" (WhatsApp, SMS o correo): si el cliente escribe
    dentro de los 30 días siguientes a recibir la campaña, la conversación queda
    asociada a ella.
  - Primer toque: el origen no se reemplaza una vez asignado.
  - Etiqueta de origen en la lista y en la cabecera del chat; filtro "Campaña"
    en la bandeja.
  - Recuperación: elegir opcionalmente una campaña al crear el plan; el
    análisis solo considera esas conversaciones.
  - Las conversaciones existentes con anuncio quedan marcadas al arrancar.
- **Fuera de alcance:** nombre de la campaña de Meta Ads (requiere la API de
  Marketing; se usa el titular del anuncio), atribución de anuncios en
  Instagram/Messenger, atribución hacia atrás de campañas de Maya enviadas
  antes de esta versión (no hay registro de a quién se le envió por WhatsApp),
  informes de rendimiento por campaña.

## Requisitos (EARS)

- **R1** — Cuando entra un chat desde un anuncio de Click-to-WhatsApp, el
  sistema debe marcar la conversación con origen `ad` (id del anuncio y titular).
- **R2** — Cuando una campaña de Maya se envía con éxito a un contacto, el
  sistema debe registrar el envío (campaña, canal, dirección, fecha).
- **R3** — Cuando ese contacto escribe y la conversación no tiene origen, si
  recibió una campaña en los últimos 30 días, el sistema debe marcar la
  conversación con la campaña más reciente.
- **R4** — Si la conversación ya tiene origen, entonces el sistema no debe
  cambiarlo.
- **R5** — Cuando el usuario abre la bandeja, el sistema debe mostrar el origen
  de campaña de cada conversación y permitir filtrar por una campaña.
- **R6** — El sistema debe ofrecer la lista de campañas presentes en las
  conversaciones de la empresa, con su número de conversaciones.
- **R7** — Cuando se crea o reanaliza un plan de recuperación con campaña, el
  análisis solo debe considerar conversaciones de WhatsApp con ese origen.
- **R8** — Al arrancar, las conversaciones con anuncio previo y sin origen deben
  quedar marcadas.
- **R9** — Seguridad: todas las consultas filtran por `tenantId` del token; el
  filtro de campaña se valida (formato `ad:<id>` / `campaign:<ObjectId>`).

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dado un mensaje entrante con referral, cuando se crea la conversación, entonces `campaign = {kind:'ad', id, name: titular}` | unitaria |
| C2 | R2 | Dada una campaña de WhatsApp, SMS o correo, cuando un envío sale bien, entonces se guarda el toque; los fallidos no | unitaria |
| C3 | R3 | Dado un toque de hace 5 días a ese teléfono, cuando el contacto escribe, entonces la conversación queda con la campaña; con uno de hace 40 días, no | unitaria |
| C4 | R4 | Dada una conversación con origen, cuando llega otro anuncio o campaña, entonces el origen no cambia | unitaria |
| C5 | R5 | Dado el filtro `campaign=campaign:<id>`, cuando se lista, entonces solo vienen esas conversaciones; la lista y la cabecera muestran el origen | unitaria + build frontend |
| C6 | R6 | `GET /conversations/campaigns` devuelve `{key, kind, name, count}` de la empresa | unitaria |
| C7 | R7 | Dado un plan con campaña, cuando se analiza, entonces la consulta filtra por esa campaña; el asistente permite elegirla | unitaria + build frontend |
| C8 | R8 | Al iniciar, `updateMany` marca conversaciones con `adReferral` sin `campaign` | unitaria |
| C9 | R9 | Un filtro con formato inválido se ignora o responde 400; consultas con `tenantId` | revisión + unitaria |
| C10 | — | Pruebas existentes de conversaciones, campañas y recuperación siguen pasando | suite completa |

## Supuestos y decisiones por defecto

- Ventana de atribución: 30 días desde el envío.
- Teléfonos: se comparan por sus últimos 9 dígitos (los formatos de los
  contactos varían: con o sin código de país, `+`, espacios).
- Toques por teléfono (WhatsApp y SMS) atribuyen conversaciones de WhatsApp;
  toques por correo atribuyen conversaciones de correo.
- Un anuncio de Meta se identifica por su id; su nombre visible es el titular
  (o "Anuncio <id>" si no trae).

## Preguntas abiertas

- Ninguna bloqueante.
