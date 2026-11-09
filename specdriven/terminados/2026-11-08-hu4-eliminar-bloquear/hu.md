# HU4 — Eliminar conversaciones y bloquear contactos

## Historia

**Como** administrador o vendedor de una empresa que usa Maya CRM,
**quiero** eliminar conversaciones que no sirven (spam, pruebas, duplicados) y
bloquear a las personas que no quiero que vuelvan a escribirnos,
**para** mantener la bandeja limpia y que el equipo y el agente IA no pierdan
tiempo con contactos molestos.

## Contexto (estado actual del código)

Las dos cosas existen a medias:

- **Eliminar**: `DELETE /conversations/:id` →
  `ConversationsService.remove()` (`backend/src/conversations/conversations.service.ts`).
  Botón "Eliminar conversación" en la bandeja (`frontend/src/app/pages/inbox/inbox.ts`,
  `deleteConversation()`), con `ConfirmService`.
  - Borra definitivamente la conversación y sus mensajes. No hay forma de
    recuperarla.
  - Cualquier rol de `CRM_ROLES` puede borrar, incluidos vendedor, marketing e
    impulsador.
  - No borra los mensajes programados (`scheduled-message.schema.ts`), los
    archivos adjuntos ni el vínculo con el lead o el cliente.
  - No avisa por tiempo real (`gateway`): a los demás usuarios les sigue
    apareciendo el chat, y el contador de no leídos no se actualiza.
  - Solo se borra de una en una.
- **Bloquear**: `PATCH /conversations/:id/block` → `setBlocked()`. Pruebas en
  `conversations.block.spec.ts`. Opción en el menú del chat y filtro
  "Solo bloqueados" en `inbox-filters.ts`.
  - El bloqueo se guarda **en la conversación** (`conversation.blocked`,
    `conversation.schema.ts`), no en el contacto.
  - Al llegar un mensaje se comprueba `conv.blocked` después de
    `upsertConversation()`.
  - En WhatsApp también bloquea en el proveedor y pasa el contacto a "No
    contactar" (`suppression`).
- **Fallo actual**: si se elimina una conversación bloqueada, el bloqueo se va
  con ella. El siguiente mensaje de esa persona crea un chat nuevo sin bloquear.
- Bloquear en un canal o una cuenta no bloquea a la misma persona en otro canal
  (otro número de WhatsApp de la empresa, Instagram, Messenger o email).
- No hay una pantalla para ver y gestionar todos los contactos bloqueados.

## Qué se pide

### A. Eliminar conversaciones

1. Eliminar una conversación o **varias a la vez**, seleccionándolas en la lista
   de la bandeja (también en el móvil).
2. Lo eliminado va a una **papelera**, de la que se puede recuperar durante 30
   días. Pasado ese plazo se borra definitivamente, con sus mensajes, mensajes
   programados y adjuntos.
3. Desde la papelera se puede restaurar o borrar definitivamente; borrar
   definitivamente pide confirmación.
4. Acción combinada **"Eliminar y bloquear"**, para spam.

### B. Bloquear contactos

1. El bloqueo pertenece al **contacto**, no a la conversación: sobrevive a que se
   elimine o se vacíe el chat.
2. Al bloquear se puede elegir: solo este canal, o **todos los canales** del
   mismo cliente (sus teléfonos, emails e identificadores de Instagram y
   Messenger conocidos).
3. Una pantalla **Contactos bloqueados**, en Configuración o Clasificar, lista
   cada bloqueo: contacto, canal, motivo, quién y cuándo, y si quedó bloqueado
   también en WhatsApp. Desde ahí se puede desbloquear.
4. Se puede bloquear un número o email que todavía no ha escrito, a mano.

## Criterios de aceptación

### Eliminar
- C1. En la lista de la bandeja se pueden seleccionar varias conversaciones y
  eliminarlas a la vez. Se pide confirmación con `ConfirmService`, indicando
  cuántas son.
- C2. Una conversación eliminada desaparece de la bandeja de **todos** los
  usuarios conectados al momento (por tiempo real), y los contadores de no
  leídos y la insignia se recalculan.
- C3. Lo eliminado aparece en **Papelera** con contacto, canal, quién lo
  eliminó y cuándo. "Restaurar" lo devuelve a la bandeja con todo su historial.
- C4. Si el contacto escribe de nuevo mientras su chat está en la papelera, se
  crea una conversación nueva y limpia. El chat de la papelera no reaparece ni
  se mezcla con la nueva.
- C5. A los 30 días un proceso en segundo plano borra definitivamente la
  conversación con sus mensajes, mensajes programados pendientes y adjuntos
  almacenados. El proceso es idempotente y no lanza errores que tumben la app.
- C6. Al eliminar, los mensajes programados pendientes de esa conversación se
  cancelan y no se envían.
- C7. El lead o cliente vinculado **no** se borra. Solo pierde el vínculo con esa
  conversación, y su ficha sigue intacta.
- C8. Por defecto, solo `TENANT_ADMIN` (y SUPERADMIN) pueden eliminar y vaciar la
  papelera. Los demás roles no ven la opción y la API les responde 403. El
  administrador puede habilitarlo para otros roles desde la matriz de permisos
  de roles.
- C9. Toda eliminación, restauración y borrado definitivo queda registrado
  (quién, cuándo, qué conversación) sin guardar el contenido de los mensajes.

### Bloquear
- C10. El bloqueo se guarda en una colección propia por empresa (canal +
  identificador normalizado: teléfono E.164, email en minúsculas, BSUID, IGSID o
  PSID). Eliminar la conversación **no** quita el bloqueo.
- C11. Lo que llega de un contacto bloqueado se descarta **antes** de crear o
  actualizar la conversación: no se guarda, no avisa (ni push ni tiempo real),
  no despierta al agente IA y no cuenta como no leído.
- C12. Al bloquear se puede elegir "solo este canal" o "todos los canales del
  cliente". En el segundo caso se bloquean todos sus identificadores conocidos.
- C13. A un contacto bloqueado no se le puede escribir desde la bandeja ni
  incluir en campañas, SMS o recuperación de clientes. Se mantiene la
  integración actual con "No contactar".
- C14. En WhatsApp se sigue bloqueando también en el proveedor. Si el proveedor
  falla, el bloqueo en la plataforma se mantiene y se muestra el motivo con un
  toast.
- C15. La pantalla **Contactos bloqueados** lista, busca y desbloquea. Permite
  añadir un bloqueo a mano (número o email) con su motivo.
- C16. Desbloquear vuelve a aceptar mensajes. El contacto sigue en "No
  contactar" hasta que se desmarque aparte, como hoy.
- C17. **Migración**: las conversaciones ya bloqueadas (`conversation.blocked`)
  pasan a la nueva colección sin perder ninguna. Los campos antiguos se mantienen
  mientras sea necesario para no romper la bandeja.
- C18. "Eliminar y bloquear" hace las dos cosas en una sola acción, con una sola
  confirmación.

### General
- C19. Todo se filtra por `tenantId`. Una empresa nunca ve, restaura,
  desbloquea ni elimina datos de otra (probado con e2e de API).
- C20. Se usa el design system (`.btn-*`, íconos lucide, sin emojis), toasts para
  éxito y error y `ConfirmService` para las acciones destructivas. Funciona en
  móvil y dentro de la app Android.
- C21. Pruebas unitarias del backend y del frontend para cada servicio nuevo, y
  un e2e de navegador del flujo eliminar → papelera → restaurar y del flujo
  bloquear → mensaje descartado → desbloquear. `npm run verify` en verde.

## Decisiones por defecto (se pueden cambiar en la spec)

- Plazo de la papelera: 30 días.
- Quién elimina: solo administrador, configurable por la matriz de roles.
- "Bloquear todos los canales" no viene marcado por defecto.
- Eliminar no bloquea: para eso está "Eliminar y bloquear".

## Fuera de alcance

- Borrar los mensajes en el teléfono del cliente o en WhatsApp/Instagram (las
  plataformas no lo permiten para conversaciones antiguas).
- Bloqueo en el proveedor para Instagram, Messenger y email (solo en la
  plataforma, como hoy).
- Exportar una conversación antes de eliminarla.
