# HU30 — Check-in en la puerta, pensado para el móvil · Especificación

Historia: `backlog/hu30-checkin-puerta-movil.md` · Fecha: 2026-11-22 · Estado: aprobada

## Objetivo

Quien recibe en la puerta necesita escanear seguido y saber al instante si la entrada vale. Hoy el escáner es un modal pequeño, el contador mezcla registros con personas y se puede dar ingreso a cancelados.

## Usuarios

- **Encargado / staff de puerta** (roles de gestión): escanea o busca invitados desde el móvil.

## Alcance

- **Incluye**:
  - Escáner a pantalla completa con resultado en color, vibración, pitido opcional y linterna.
  - Contador en personas.
  - Lista manual propia, solo con registros confirmados.
  - Deshacer un check-in.
  - Rechazo de cancelados en el backend.
- **Fuera de alcance**: check-in sin conexión.

## Requisitos (EARS)

- **R1** — Cuando se abre el escáner, el sistema debe ocupar toda la pantalla visible (`100dvh`, áreas seguras) y seguir leyendo sin cerrarse tras cada lectura.
- **R2** — Cuando se lee un código, el sistema debe mostrar durante unos 2 s una tarjeta y vibrar con un patrón distinto según el resultado:
  - Verde: nombre y grupo.
  - Ámbar: ya ingresó, con la hora.
  - Rojo: no válida o cancelada.
- **R3** — Si el dispositivo lo soporta, el escáner debe ofrecer linterna; el pitido es opcional y se recuerda en el dispositivo.
- **R4** — El contador y la tasa de asistencia deben contar personas (`partySize`) de los registros confirmados, en el numerador y en el denominador.
- **R5** — La lista de check-in debe:
  - Mostrar solo confirmados.
  - Buscar por nombre, email, teléfono o ticket.
  - No depender de los filtros de Asistentes.
  - Marcar los grupos con "Grupo de N".
- **R6** — Si un registro está cancelado, entonces el backend debe rechazar el check-in (manual o por código) con 409 y un mensaje.
- **R7** — Tras un check-in, el sistema debe ofrecer "Deshacer" durante unos segundos. El backend debe exponer `DELETE /events/:id/registrations/:regId/check-in` con los mismos permisos que el check-in y comprobar que el registro pertenece al evento del tenant.
- **R8 (no funcional)** — Buscador ≥ 16 px; sin hover en táctil; colores con variables.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R2 | Una lectura válida da verde y vibra; una repetida, ámbar; un 404/409, rojo. El escáner sigue abierto | unitaria del componente (lecturas simuladas) |
| C2 | R4 | Con un registro de 3 personas con check-in, otro de 2 sin él y uno cancelado, el contador es 3/5 y la tasa, 60 % | unitaria del store |
| C3 | R5 | El cancelado no aparece; buscar por teléfono encuentra; cambiar el filtro de Asistentes no cambia la lista | unitaria |
| C4 | R6 | El check-in de un cancelado responde 409 y no guarda | unitaria backend |
| C5 | R7 | Deshacer llama al DELETE y el contador baja; el backend limpia `checkedIn` | unitarias backend y frontend |
| C6 | R8 | Buscador con la clase `.input` (16 px en el móvil) | revisión |
| C7 | R1, R3 | Pantalla completa, linterna y pitido en un móvil real | **[usuario]** |

## Supuestos y decisiones por defecto

- Si una lectura falla por red, se trata como rojo con el mensaje del error.
- Deshacer dura 6 s y aplica al último check-in.

## Preguntas abiertas

- Ninguna.
