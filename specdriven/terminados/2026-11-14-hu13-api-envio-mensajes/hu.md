# HU13 — API de envío de mensajes por las cuentas conectadas

## Historia

**Como** empresa que usa Maya CRM,
**quiero** elegir una de mis cuentas conectadas (WhatsApp, Instagram,
Messenger, SMS…) y generar un endpoint con su clave,
**para** enviar mensajes por esa cuenta desde fuera de la plataforma, por
ejemplo desde mi página web o mi sistema, sin entrar a la bandeja.

## Problema observado

- Hoy solo se puede enviar desde la propia plataforma: la bandeja
  (`POST /conversations/:id/messages` → `ConversationsService.sendManual`,
  `backend/src/conversations/conversations.service.ts` ≈ línea 1242),
  campañas o el agente IA. Todos exigen una sesión de usuario (JWT).
- No existe ningún mecanismo de claves de API para terceros. Los envíos por
  canal ya existen: `whatsapp/whatsapp.service.ts` (Cloud API, texto, medios y
  plantillas), `messenger/messenger.service.ts`, `instagram/instagram.service.ts`
  y `sms/sms.service.ts`.

## Alcance pedido

1. **Módulo nuevo "API" / "Integraciones"** en el menú (grupo Gestión), con su
   permiso en `roles/modules.catalog.ts`. Solo el administrador o quien tenga el
   permiso puede crear o revocar accesos.
2. **Crear un acceso:** el usuario elige **una** cuenta conectada (de las que
   ya tiene en WhatsApp, Instagram, Messenger o SMS), le pone un nombre y el
   sistema genera:
   - la URL del endpoint (p. ej. `POST https://api.mayacrm.site/public/v1/messages`);
   - una clave secreta que se muestra **una sola vez** (se guarda solo su hash);
   - un ejemplo listo para copiar (cURL y JavaScript `fetch`).
3. **Enviar un mensaje con el endpoint:** con la clave en una cabecera
   (`Authorization: Bearer <clave>`), destinatario y contenido:
   - WhatsApp: número en formato internacional; texto, o **plantilla aprobada**
     con variables (obligatoria si el contacto no escribió en las últimas 24 h);
     opcionalmente imagen o documento por URL.
   - Instagram y Messenger: solo a contactos que ya escribieron a la cuenta y
     dentro de la ventana que permite Meta; el destinatario es el id del
     contacto o el de la conversación.
   - SMS: número y texto.
   - La respuesta devuelve un id de mensaje y su estado inicial; si falla, un
     error claro (cuenta desconectada, fuera de la ventana de 24 h, contacto
     bloqueado o en "No contactar", plantilla inexistente…).
4. **Lo enviado aparece en la bandeja** en la conversación del contacto (se
   crea si no existe), marcado como enviado "por API" con el nombre del acceso.
   El agente IA y las reglas actuales siguen funcionando sobre esa conversación.
5. **Consultar el estado** de un mensaje enviado (`GET …/messages/:id`:
   pendiente, enviado, entregado, leído, fallido).
6. **Administrar los accesos:** lista con nombre, cuenta, fecha de creación,
   último uso y nº de envíos; revocar (deja de funcionar al instante) y
   regenerar la clave.
7. **Límites:** límite de envíos por minuto y por día por acceso (con valor por
   defecto y editable); al superarlo, `429` con el tiempo de espera.

## Contexto y supuestos a validar en la spec

- **Seguridad, el punto delicado:** "consumir desde mi página web" puede
  significar llamarlo desde el navegador del visitante, y ahí la clave
  quedaría a la vista y cualquiera podría enviar mensajes a nombre de la
  empresa. Propuesta por defecto:
  - la clave secreta es para servidor a servidor (el backend de la web del
    cliente), y la documentación lo dice bien claro;
  - si se quiere usar desde el navegador, el acceso se marca como "público" con
    **dominios permitidos** (CORS/Origin) y **restricciones**: solo plantillas
    fijas, o solo a un número/destinatario fijo (p. ej. "avisar a mi equipo
    cuando alguien llena el formulario"), más límites bajos y Turnstile
    opcional.
  - Decidir en la spec si el modo público entra en esta historia o en otra.
- Respetar la lista de "No contactar" (`suppression/`) y los contactos
  bloqueados, como hacen las campañas (ver skill `maya-outbound-send`).
- Aislamiento por tenant: la clave solo puede enviar por la cuenta elegida, y
  esa cuenta debe seguir siendo del mismo tenant.
- Idempotencia: cabecera `Idempotency-Key` opcional para que un reintento no
  mande el mensaje dos veces.
- Opcional, valorar en la spec: webhook de salida para avisar al sistema del
  cliente de los cambios de estado y de las respuestas del contacto. Si no
  entra, dejarlo anotado como siguiente historia.
- Registro de auditoría de cada envío (acceso, cuenta, destinatario enmascarado,
  resultado), sin guardar la clave ni el contenido en los logs.
- Página de documentación del endpoint dentro del módulo (parámetros, errores,
  ejemplos), en español.
- Pruebas: unitarias del guard de la clave (válida, revocada, de otro tenant,
  otra cuenta), límites, ventana de 24 h, "No contactar"; e2e de API que cree
  un acceso, envíe con la clave (proveedor simulado) y vea el mensaje en la
  conversación; e2e de navegador de crear, copiar y revocar.
