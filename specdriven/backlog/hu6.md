# HU6 — Llamadas de WhatsApp (módulo Llamadas)

## Historia

**Como** vendedor o agente de atención de una empresa en Maya CRM,
**quiero** recibir y hacer llamadas de voz de WhatsApp desde la plataforma, en
un módulo propio de Llamadas,
**para** atender a los clientes que prefieren llamar sin usar un teléfono
personal, y que cada llamada quede registrada en la ficha del cliente.

## Contexto (estado actual del código)

- WhatsApp funciona solo por **Cloud API de Meta** (`provider: 'cloudapi'`,
  `whatsapp-account.schema.ts`). El webhook está en
  `conversations/whatsapp-webhook.controller.ts` (`handleCloud`) y hoy solo
  procesa `messages` y `statuses`. Cualquier otro tipo de evento se ignora.
- No hay nada de llamadas: ni esquema, ni WebRTC, ni pantalla. Si un cliente
  intenta llamar al número de la empresa, la llamada no llega a ningún sitio.
- Piezas que se pueden reutilizar:
  - tiempo real por socket (`conversations.gateway.ts`);
  - notificaciones push (HU3, `backend/src/push/`);
  - permisos por módulo (`roles/modules.catalog.ts`, `ModuleGuard`);
  - contactos y bloqueos (HU4, `blocked_contacts`);
  - ficha del cliente y actividad (`contactactivities`);
  - app Android con Capacitor (`mobile`).

## Cómo funciona en Meta (a confirmar contra la documentación vigente en la spec)

- La **WhatsApp Business Calling API** es parte de Cloud API. Hay que activar
  las llamadas en cada número (`/{phone-number-id}/settings`, `calling`), con
  horario, visibilidad del botón de llamada y devolución de llamada.
- **Llamada entrante:**
  - Meta avisa por el webhook (campo `calls`, evento `connect`), con una oferta
    SDP.
  - La empresa responde con `pre_accept` y `accept` (o `reject`) en
    `POST /{phone-number-id}/calls`.
  - El audio va por **WebRTC** entre Meta y quien atiende: el navegador o la app.
  - Al colgar llega `terminate`, con la duración y el estado.
- **Llamada saliente:**
  - Requiere que el cliente haya dado **permiso de llamada**: una solicitud por
    mensaje o plantilla, válida durante un tiempo limitado.
  - Después se inicia con `connect` y una oferta SDP propia.
- **Coste:** las entrantes no se cobran; las salientes se cobran por minuto.
  Meta no graba las llamadas.
- **Límites:** países y números habilitados, número mínimo de conversaciones,
  máximo de solicitudes de permiso. Hay que comprobarlos al activar.

## Qué se pide

### A. Módulo "Llamadas" (aparte de Conversaciones)

1. Nueva entrada de menú y ruta `/llamadas`, con su propio permiso en la
   matriz de roles (`calls`).
2. **Historial:**
   - entrantes, salientes, perdidas y rechazadas;
   - fecha, duración, cliente, cuenta de WhatsApp y quién atendió;
   - filtros por estado, fecha, usuario y cuenta.
3. Desde el historial: devolver la llamada (si hay permiso vigente), abrir la
   ficha del cliente o ir a su conversación.

### B. Recibir llamadas

1. Con la plataforma abierta, una llamada entrante muestra un aviso de llamada
   (nombre o número, cuenta, aceptar o rechazar) a los usuarios con permiso
   `calls` y disponibles.
2. Si la plataforma está cerrada, llega una notificación push.
3. Atender se hace en el navegador (micrófono y audio por WebRTC):
   - silenciar, colgar y ver el tiempo transcurrido;
   - la primera vez se pide permiso de micrófono, con un mensaje claro si se
     niega.
4. Si nadie contesta en el tiempo de espera, o fuera del horario configurado,
   queda como **perdida**. Opción de responder automáticamente por WhatsApp con
   un mensaje configurable.
5. Cuando un usuario atiende, el aviso desaparece para los demás.
6. Las llamadas de un contacto bloqueado (HU4) se rechazan solas y no avisan a
   nadie.

### C. Hacer llamadas

1. Botón "Llamar" en el módulo Llamadas, en la ficha del cliente y en la
   conversación de WhatsApp.
2. **Sin permiso de llamada:** ofrecer enviar la solicitud de permiso y mostrar
   su estado (pendiente, concedido hasta tal fecha, rechazado o vencido).
3. **Con permiso:** iniciar la llamada, mostrar "llamando…" y conectar el audio
   al contestar.

### D. Configuración por cuenta de WhatsApp

1. Activar o desactivar las llamadas en cada número desde la plataforma.
2. Configurar horario de atención, visibilidad del botón de llamada y
   devolución de llamada.
3. Mostrar el motivo si Meta no permite activarlas (país, límites o permisos de
   la app).

### E. Registro

1. Cada llamada queda en la ficha del cliente (actividad) y como evento en su
   conversación de WhatsApp: "Llamada entrante · 3 min 12 s · atendió Ana".
2. Contadores básicos en el panel: llamadas, perdidas y duración media.

## Criterios de aceptación

- C1. Con las llamadas activadas en un número, una llamada real de un cliente
  hace sonar el aviso en la plataforma abierta de los usuarios con permiso
  `calls`, en menos de 3 s desde el webhook.
- C2. Al aceptar, las dos partes se oyen. Al colgar cualquiera de las dos, la
  llamada se cierra en la plataforma y en el teléfono del cliente. **[usuario:
  prueba real con un número habilitado]**
- C3. Si nadie contesta, queda como perdida, con su hora. Si está activado, el
  cliente recibe el mensaje automático.
- C4. Cuando un usuario atiende, el aviso desaparece para los demás, y un
  segundo intento de aceptar responde "ya atendida".
- C5. Con la plataforma cerrada llega una push de llamada entrante (Android y,
  si es posible, PWA de iPhone).
- C6. Una llamada de un contacto bloqueado se rechaza sin avisar y queda en el
  historial como "rechazada (bloqueado)".
- C7. Sin permiso de llamada no se puede llamar: se ofrece la solicitud de
  permiso. Con permiso vigente se inicia y conecta la llamada saliente.
- C8. El historial lista entrantes, salientes, perdidas y rechazadas con
  duración y usuario, filtra por estado, fecha, usuario y cuenta, y está aislado
  por empresa.
- C9. Cada llamada terminada aparece en la ficha del cliente y en su
  conversación de WhatsApp.
- C10. Activar o desactivar las llamadas y el horario se guarda en Meta, y la
  plataforma refleja el estado real. Si Meta se niega, se muestra su motivo.
- C11. Un rol sin `calls` no ve el módulo ni recibe avisos, y las rutas
  responden 403.
- C12. Si el usuario niega el micrófono, se explica cómo concederlo y la llamada
  no se acepta a medias.
- C13. Los webhooks de llamadas se validan con la firma de Meta (como los de
  mensajes). En los logs no aparecen números de teléfono ni SDP completos.
- C14. Pruebas:
  - unitarias de backend (servicio de llamadas, máquina de estados, webhook);
  - unitarias de frontend (aviso, panel de llamada, historial);
  - e2e de API con webhooks simulados (entrante, perdida, bloqueada, aislamiento);
  - e2e de navegador del historial y del aviso, con WebRTC simulado.
- C15. `npm run verify` pasa completo.

## Fuera de alcance

- Videollamadas.
- Grabación y transcripción de llamadas. Se pueden plantear en otra historia;
  requieren aviso legal al cliente.
- El agente IA contestando llamadas por voz.
- Llamadas con proveedores distintos de Cloud API, y telefonía convencional
  (SIP/PSTN).
- Transferir una llamada en curso a otro usuario. Puede valorarse en la spec si
  la API lo permite sin colgar.

## Decisiones por defecto (revisables en la spec)

- **Atención:** el audio va directo del navegador a Meta por WebRTC. El backend
  solo hace de señalización (SDP y acciones), así que no hace falta un servidor
  de medios propio. Si Meta exige un endpoint de medios del lado empresa, se
  replantea en el plan.
- **Reparto:** suena para todos los usuarios con `calls` y disponibles, y la
  atiende el primero que acepta. Un reparto por cola o asignación queda para más
  adelante.
- **Tiempo de espera:** 30 s antes de marcarla como perdida (configurable).
- **Datos:** nueva colección `calls` (empresa, cuenta, contacto, dirección,
  estado, inicio, fin, duración, atendida por, id de llamada de Meta), y un
  permiso de llamada por contacto con su vencimiento.
- **App Android:** atender desde la app usa el mismo WebRTC del WebView.
  CallKit o ConnectionService (pantalla nativa de llamada) queda fuera de esta
  historia.
