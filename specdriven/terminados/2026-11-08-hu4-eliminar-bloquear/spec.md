# HU4 — Eliminar conversaciones y bloquear contactos · Especificación

Historia: `backlog/hu4.md` · Fecha: 2026-11-08 · Estado: aprobada

## Objetivo

Que la bandeja se pueda limpiar sin miedo (papelera recuperable 30 días, borrado
en lote) y que un contacto bloqueado quede bloqueado de verdad: aunque se
elimine su chat, escriba por otro canal o vuelva semanas después. Hoy el
bloqueo vive en la conversación y se pierde al eliminarla.

## Usuarios

- Administrador de la empresa: elimina, restaura, vacía la papelera, decide qué
  otros roles pueden eliminar.
- Vendedor / marketing / gerente (roles con bandeja): bloquea y desbloquea
  contactos; elimina solo si el administrador se lo concedió.

## Alcance

- Incluye: papelera de conversaciones (eliminar una o varias, restaurar, borrar
  definitivo, vaciar, purga automática a los 30 días), "Eliminar y bloquear",
  bloqueo por contacto (colección propia) con opción "todos los canales del
  cliente", pantalla de contactos bloqueados con alta manual y desbloqueo,
  migración de los bloqueos actuales, tiempo real al eliminar/restaurar.
- **Fuera de alcance:** borrar mensajes en el móvil del cliente o en Meta;
  bloqueo en el proveedor para Instagram, Messenger y correo (solo plataforma,
  como hoy); bloqueo en el proveedor de WhatsApp en cuentas distintas a la del
  chat; exportar antes de eliminar; tabla de auditoría consultable (el registro
  queda en la conversación mientras está en la papelera y en logs).

## Requisitos (EARS)

Funcionales — eliminar:
- **R1** — Cuando un usuario con permiso elimina una o varias conversaciones, el
  sistema debe moverlas a la papelera (no borrarlas), guardando quién y cuándo.
- **R2** — Mientras una conversación está en la papelera, el sistema debe
  ocultarla de la bandeja, de los contadores de no leídos, de los paneles y de
  cualquier otra consulta, salvo de la propia papelera.
- **R3** — Cuando se elimina o restaura una conversación, el sistema debe avisar
  por tiempo real a todos los usuarios conectados de la empresa.
- **R4** — Cuando se restaura una conversación, el sistema debe devolverla con
  todo su historial; si entretanto se creó un chat nuevo con el mismo contacto
  y cuenta, debe unir el historial de la papelera a ese chat.
- **R5** — Cuando llega un mensaje de un contacto cuyo chat está en la papelera,
  el sistema debe crear una conversación nueva sin tocar la de la papelera.
- **R6** — Cuando una conversación pasa a la papelera, el sistema debe cancelar
  sus mensajes programados pendientes.
- **R7** — Cuando una conversación lleva 30 días en la papelera (o se borra
  definitivamente a mano), el sistema debe borrar la conversación, sus mensajes,
  sus mensajes programados y los adjuntos recibidos del cliente, y quitar la
  referencia en leads, actividades y citas sin borrarlos.
- **R8** — Si el usuario no es administrador y su rol no tiene "Eliminar"
  marcado expresamente en Bandeja, entonces el sistema debe rechazar eliminar,
  ver la papelera, restaurar y borrar definitivo (403) y la interfaz no debe
  ofrecer esas opciones.

Funcionales — bloquear:
- **R9** — Cuando se bloquea un contacto, el sistema debe guardar el bloqueo por
  empresa + canal + identificador normalizado, independiente de la conversación.
- **R10** — Cuando llega un mensaje (o eco) de un identificador bloqueado, el
  sistema debe descartarlo antes de crear o actualizar la conversación, sin
  avisar, sin agente IA y sin contar como no leído.
- **R11** — Cuando se bloquea con "todos los canales del cliente", el sistema
  debe bloquear también los demás identificadores conocidos del cliente
  vinculado (teléfono → WhatsApp, email → correo, y los contactos de sus otras
  conversaciones).
- **R12** — Mientras un contacto está bloqueado, el sistema debe impedir
  escribirle desde la bandeja (incluido redactar un correo nuevo) y mantenerlo en
  "No contactar" para campañas, SMS y recuperación.
- **R13** — Cuando se bloquea un chat de WhatsApp, el sistema debe intentar el
  bloqueo en el proveedor; si falla, debe mantener el bloqueo en la plataforma y
  devolver el motivo.
- **R14** — Cuando se desbloquea (desde el chat o desde la pantalla de
  bloqueados), el sistema debe volver a aceptar mensajes de ese identificador,
  sin sacarlo de "No contactar".
- **R15** — Cuando un usuario añade un bloqueo a mano (canal + número/email/id +
  motivo), el sistema debe normalizarlo y aplicarlo aunque nunca haya escrito.
- **R16** — Cuando arranca la aplicación, el sistema debe migrar cada
  conversación con `blocked: true` a la colección de bloqueos, sin duplicar.
- **R17** — Cuando se usa "Eliminar y bloquear", el sistema debe bloquear y mover
  a la papelera en una sola acción.

No funcionales:
- **R18** — Seguridad: todo filtrado por `tenantId` del JWT; ids validados;
  ninguna operación toca datos de otra empresa.
- **R19** — Privacidad: los logs registran ids y acciones, nunca el contenido de
  los mensajes ni el identificador completo del contacto.
- **R20** — Rendimiento: la comprobación de bloqueo al recibir un mensaje es una
  consulta por índice único; la purga trabaja por lotes.
- **R21** — Accesibilidad e interfaz: design system, lucide, toasts,
  `ConfirmService`, foco y `aria-*`, usable en móvil y en la app Android.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dado un admin, cuando selecciona varias conversaciones y confirma "Eliminar", entonces pasan a la papelera con `trashedBy`/`trashedAt` | unitaria backend + unitaria frontend (selección) |
| C2 | R3 | Dado otro usuario conectado, cuando se elimina un chat, entonces recibe `conversation:removed`, el chat sale de su lista y se recalcula el no leído | unitaria (gateway llamado) + unitaria frontend (realtime) |
| C3 | R2 | Dado un chat en la papelera, cuando se consulta la bandeja, el contador de no leídos o el panel, entonces no aparece | unitaria del filtro del esquema + e2e API |
| C4 | R1, R4 | Dado un chat en la papelera, cuando se pulsa "Restaurar", entonces vuelve a la bandeja con su historial | unitaria + e2e navegador |
| C5 | R4, R5 | Dado un chat en la papelera y un mensaje nuevo del mismo contacto, entonces se crea un chat nuevo; al restaurar, el historial se une a ese chat | unitaria + e2e API |
| C6 | R6 | Dado un mensaje programado pendiente, cuando el chat va a la papelera, entonces queda `cancelled` | unitaria |
| C7 | R7 | Dado un chat con 31 días en la papelera, cuando corre la purga, entonces se borran chat, mensajes, programados y adjuntos entrantes, y leads/actividades/citas pierden la referencia sin borrarse | unitaria |
| C8 | R7 | Cuando se pulsa "Borrar definitivamente" o "Vaciar papelera" y se confirma, entonces se aplica lo de C7 al momento | unitaria + unitaria frontend |
| C9 | R8 | Dado un vendedor sin "Eliminar" explícito en Bandeja, cuando llama a eliminar, papelera o restaurar, entonces 403; en la interfaz no ve las opciones | unitaria + e2e API |
| C10 | R8 | Dado un rol con `actions.inbox` que incluye `delete`, entonces puede eliminar | unitaria |
| C11 | R9, R10 | Dado un contacto bloqueado cuyo chat se eliminó, cuando escribe de nuevo, entonces el mensaje se descarta y no se crea chat | unitaria + e2e API |
| C12 | R10 | Cuando llega un mensaje de un identificador bloqueado, entonces no se guarda, no hay push, ni tiempo real, ni agente | unitaria |
| C13 | R11 | Dado un chat con cliente vinculado, cuando se bloquea con "todos los canales", entonces quedan bloqueados su WhatsApp, su email y los contactos de sus otros chats | unitaria |
| C14 | R12 | Dado un contacto bloqueado, cuando se intenta escribirle o redactarle un correo, entonces 400 con mensaje claro; sigue en "No contactar" | unitaria |
| C15 | R13 | Dado WhatsApp que rechaza el bloqueo, entonces queda bloqueado en la plataforma y la respuesta trae el motivo (toast) | unitaria (existente adaptada) |
| C16 | R14 | Cuando se desbloquea desde el chat o desde la pantalla, entonces se aceptan de nuevo sus mensajes y sigue en "No contactar" | unitaria + e2e navegador |
| C17 | R15 | Cuando se añade a mano "999 888 777" en WhatsApp, entonces se guarda como `51999888777` y bloquea los mensajes de ese número | unitaria |
| C18 | R16 | Dado una conversación con `blocked: true` sin bloqueo en la colección, cuando arranca el módulo, entonces se crea su bloqueo; si ya existe, no se duplica | unitaria |
| C19 | R17 | Cuando se usa "Eliminar y bloquear" y se confirma una vez, entonces el contacto queda bloqueado y el chat en la papelera | unitaria backend + frontend |
| C20 | R18 | Dado un usuario de otra empresa, cuando intenta restaurar, borrar o desbloquear ids ajenos, entonces 404 | e2e API |
| C21 | R19 | Los logs nuevos solo contienen ids y acciones | revisión |
| C22 | R21 | Pantallas con toasts, `ConfirmService`, lucide, `aria-*`, estados cargando/vacío/error | unitaria frontend + revisión |
| C23 | — | `npm run verify` en verde | comando |

## Supuestos y decisiones por defecto

- Papelera 30 días. Purga cada hora, por lotes de 100.
- Permiso de eliminar: TENANT_ADMIN y SUPERADMIN siempre; otro rol solo si su
  `actions.inbox` incluye `delete` de forma explícita (la ausencia de entrada,
  que en el resto de la plataforma significa "todo", aquí no concede borrar).
- Bloquear y desbloquear: los mismos roles que hoy (`CRM_ROLES`).
- El bloqueo es por canal y vale para todas las cuentas de ese canal de la
  empresa. El bloqueo en el proveedor de WhatsApp se intenta solo en la cuenta
  del chat.
- Identificadores: WhatsApp → dígitos (`phoneDigits`) o BSUID tal cual; correo →
  minúsculas; Instagram/Messenger → id tal cual.
- `conversation.blocked` se mantiene como copia para la interfaz y el filtro
  "Solo bloqueados" (expand → migrate; no se retira en esta historia).
- Restaurar cuando ya hay un chat activo une el historial en el activo.
- Solo se borran de S3 los adjuntos de mensajes entrantes del cliente: los
  salientes pueden ser archivos compartidos (plantillas, catálogo).
- "Registro" de eliminaciones: `trashedBy`/`trashedByName`/`trashedAt` en la
  conversación mientras está en la papelera y log estructurado con ids al
  eliminar, restaurar y purgar.
- Contactos bloqueados vive como panel en el menú ⋮ de la Bandeja (la historia
  pedía Configuración o Clasificar): se gestiona donde se bloquea y no exige una
  ruta ni un permiso nuevos.
- En la matriz, "Eliminar" de Bandeja significa solo eliminar conversaciones.
  Desbloquear y cancelar un programado (rutas `DELETE`) se declaran como
  "Editar" con `@RouteAction('edit')`.

## Preguntas abiertas

- Ninguna bloqueante.
