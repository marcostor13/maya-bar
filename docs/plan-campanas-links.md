# Plan — Plantillas, campañas masivas, SMS, links cortos y atención por agente

Fuente de verdad de los requerimientos pedidos el 2026-10-06. El agente
`requirements-supervisor` audita contra los **criterios de aceptación** de este
documento: si un criterio cambia, se cambia aquí primero.

## 1. Qué hay hoy y qué falta

| #   | Requerimiento                                             | Hoy                                                                                                                                             | Brecha                                                                                                |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| R1  | Plantillas HTML de email, con IA y manuales               | No existe. El email de campaña es texto plano escapado dentro de un layout fijo (`mail.service.ts` `sendCampaign`). La IA solo genera texto.    | Entidad, editor por bloques + HTML, generación con IA, vista previa.                                  |
| R2  | Asignar cliente a un agente, autoasignación e historial   | Completo para **oportunidades** (`Lead.ownerId`, claim/transfer/release, `LeadActivity`). El **contacto** (`Customer`) no tiene responsable.     | Responsable en el contacto, tomar/derivar/liberar, historial a nivel de contacto.                     |
| R3  | Pasos del embudo editables                                | **Ya existe**: crear, renombrar, color, probabilidad, reordenar y eliminar con traslado (`lead-stages-config.ts`, `/leads/stages`).              | Ninguna funcional. Solo se verifica.                                                                  |
| R4  | Comentarios y acciones en cada contacto con el cliente    | Completo por oportunidad (nota, llamada, WhatsApp, email, reunión, tarea). En el contacto solo hay un texto `notes` sin autor ni fecha.         | Bitácora por contacto, visible en la ficha y desde la conversación.                                   |
| R5  | Campañas de correo masivas con plantillas                 | Campañas email con `Promise.allSettled` dentro de la petición HTTP: sin lotes, sin estado por destinatario, sin baja, remitente fijo de Resend. | Usar plantilla HTML, envío en segundo plano por lotes, estado por destinatario, link de baja.         |
| R6  | SMS masivos                                               | No existe ningún código de SMS.                                                                                                                 | Canal `sms` en campañas sobre el mismo motor de envío.                                                |
| R7  | Plantillas de texto intuitivas con variables              | Motor de tokens mínimo (`{nombre}`, `{email}`, `{telefono}`), usado de forma inconsistente. "Plantillas" hoy son las de Meta.                   | Entidad de plantilla de mensaje, editor con chips de variables y vista previa, más variables.         |
| R8  | Links cortos con dominio propio, captura y dashboard      | No existe.                                                                                                                                      | Dominios, links, redirección con registro del clic, analítica.                                        |
| R9  | Links cortos masivos (Excel o lista)                      | No existe.                                                                                                                                      | Lotes de links personales por contacto, exportables y usables como variable `{link}`.                 |
| R10 | Mejor experiencia lista ⇄ contactos                       | De Clientes a lista sí (checkboxes + "Agregar a lista"). Dentro de una lista solo se ve y se quita de uno en uno.                               | Selector de contactos dentro de la lista, quitar en bloque, más acciones masivas en Clientes.         |
| R11 | Proveedor de SMS configurable (cualquiera)                | No existe.                                                                                                                                      | Proveedor HTTP genérico definido por el usuario, con presets y prueba de envío.                       |

## 2. Decisiones de diseño

- **Permisos sin migración.** Todo lo nuevo cuelga de módulos que ya existen en
  la matriz de roles: plantillas de email/texto, SMS y links usan `campaigns`
  (igual que `/recuperacion`); la bitácora y el responsable del contacto usan
  `customers`. No se añaden claves a `ALL_MODULES`: los roles ya guardados en
  la base no las recibirían solos. La única excepción es la configuración del
  proveedor de SMS, que vive en Configuración y exige el módulo `settings`.
- **El responsable vive en el contacto**, no solo en la oportunidad:
  `Customer.ownerId`. Las oportunidades conservan su propio `ownerId`; al tomar
  o derivar un contacto no se tocan sus oportunidades.
- **Una sola bitácora por contacto**: colección `contactactivities`. Los
  eventos de asignación se escriben solos y no se pueden borrar; los
  comentarios y acciones los escribe el agente. La ficha del contacto muestra
  también, en la misma línea de tiempo, las actividades de sus oportunidades.
- **Un único motor de envío masivo** (`campaigns` + colección
  `campaignrecipients`): cron por minuto con bloqueo atómico en Mongo, lotes,
  estado por destinatario y reanudación tras reinicio. Es el patrón de
  `recovery`, no el `Promise.allSettled` actual. Email y SMS pasan por él;
  WhatsApp conserva su camino actual.
- **Variables con una sola sintaxis**, la existente de llaves simples:
  `{nombre}`, `{primer_nombre}`, `{email}`, `{telefono}`, `{empresa}`,
  `{link}`, `{baja}` y `{campo:clave}` para `customFields`. Todo sale de
  `shared/contact-tokens.ts`; ningún `replace` suelto.
- **Editor de email propio, sin librerías**: bloques (cabecera, texto, imagen,
  botón, divisor, columnas, pie) que se compilan a HTML de tablas apto para
  clientes de correo, más un modo "HTML" para pegar código. Se guarda el
  diseño (JSON) y el HTML compilado.
- **SMS agnóstico del proveedor**: el usuario define una petición HTTP (URL,
  método, cabeceras, cuerpo con `{to}`, `{message}`, `{from}`) y cómo reconocer
  el éxito. Los presets (Twilio, Infobip, Vonage…) solo rellenan ese
  formulario. Las credenciales se cifran con `SecretBox`.
- **Links cortos**: el backend resuelve `GET /l/:code` en su dominio y
  `GET /:code` cuando el `Host` es un dominio corto registrado. Un dominio
  propio necesita un registro `A` a la IP del servidor y estar en los dominios
  de la app en Coolify para que Traefik lo enrute y emita el certificado: se
  declara en `SHORT_LINK_DOMAINS` y `npm run provision` lo aplica.
- **Captura del clic**: IP, user-agent (navegador, sistema, dispositivo),
  idioma, referer, parámetros de la URL, cookies propias del dominio corto y
  un identificador de visitante (cookie `mlv`) para distinguir únicos. Los
  bots y previsualizadores (WhatsApp, Facebook, etc.) se marcan y no cuentan
  como clics humanos. La geolocalización por IP es opcional (`GEOIP_URL`).

## 3. Fases

| Fase | Contenido                                                                 | Requerimientos |
| ---- | ------------------------------------------------------------------------- | -------------- |
| 0    | Este plan, skills y agente supervisor                                     | —              |
| 1    | Responsable del contacto, bitácora, mejoras lista ⇄ contactos             | R2, R4, R10    |
| 2    | Motor de variables y plantillas de mensaje                                | R7             |
| 3    | Plantillas HTML de email (bloques, HTML, IA)                              | R1             |
| 4    | Proveedor SMS configurable                                                | R11            |
| 5    | Motor de envío masivo: email con plantilla y SMS                          | R5, R6         |
| 6    | Links cortos, dominios, captura y dashboard                               | R8             |
| 7    | Links masivos por Excel o lista y variable `{link}` en campañas           | R9             |
| 8    | Verificación del embudo y auditoría final                                 | R3, todos      |

## 4. Criterios de aceptación

Cada criterio debe poder demostrarse con `archivo:línea` o con una prueba.

### R1 — Plantillas HTML de email
- R1.1 CRUD de plantillas por empresa (`/email-templates`) con nombre, asunto, diseño y HTML.
- R1.2 Editor manual por bloques: añadir, reordenar, duplicar y eliminar bloques; al menos cabecera, texto, imagen, botón, divisor, columnas y pie; estilos globales (colores, ancho, tipografía).
- R1.3 Modo HTML para editar o pegar el código directamente.
- R1.4 Generación con IA a partir de una descripción (tema, tono, objetivo), editable después.
- R1.5 Vista previa escritorio/móvil con variables resueltas con datos de ejemplo.
- R1.6 Subida de imágenes desde el editor y envío de prueba a un correo.
- R1.7 Plantillas de partida (galería) para no empezar en blanco.

### R2 — Asignación de clientes
- R2.1 Un contacto tiene responsable (`ownerId`) visible en la lista y en la ficha.
- R2.2 Un supervisor puede asignar o derivar un contacto a cualquier usuario activo.
- R2.3 Un agente puede asignarse a sí mismo un contacto sin responsable.
- R2.4 Se puede liberar un contacto.
- R2.5 Cada asignación queda en el historial del contacto con origen, destino, autor y fecha, y no se puede borrar.
- R2.6 Asignación masiva desde la lista de contactos y filtro por responsable ("Míos", "Sin asignar").

### R3 — Embudo editable
- R3.1 Crear, renombrar, recolorear, reordenar y eliminar etapas desde la interfaz (ya existente; se verifica).

### R4 — Comentarios y acciones
- R4.1 El agente registra en un contacto un comentario o una acción con tipo (nota, llamada, WhatsApp, email, SMS, reunión, visita, tarea), fecha y detalle.
- R4.2 La ficha del contacto muestra la línea de tiempo con autor y fecha, incluyendo asignaciones y actividades de sus oportunidades.
- R4.3 Se puede editar y eliminar lo propio; los eventos automáticos no.
- R4.4 Se puede registrar desde la conversación (inbox) sin salir de ella.

### R5 — Campañas de email masivas
- R5.1 Una campaña de email puede usar una plantilla HTML guardada.
- R5.2 El envío corre en segundo plano por lotes y sobrevive a un reinicio.
- R5.3 Estado por destinatario (pendiente, enviado, fallido, omitido) y contadores en la campaña.
- R5.4 Variables resueltas por destinatario en asunto y cuerpo.
- R5.5 Respeta la lista de no contactar e incluye link de baja funcional.
- R5.6 Se puede programar el envío y elegir el remitente (buzón de la empresa o el de la plataforma).

### R6 — SMS masivos
- R6.1 Campaña de tipo SMS con audiencia por todos, etiquetas, listas o selección manual.
- R6.2 Contador de caracteres y segmentos, y aviso de coste por segmentos.
- R6.3 Mismo motor: lotes, estado por destinatario, no contactar.

### R7 — Plantillas de mensaje con variables
- R7.1 CRUD de plantillas de texto por canal (SMS, WhatsApp, email).
- R7.2 Las variables se insertan con un clic (chips), no escribiéndolas a mano.
- R7.3 Vista previa en vivo con un contacto de ejemplo y aviso de variables desconocidas.
- R7.4 Se pueden usar desde el editor de campañas.
- R7.5 Variables de campos personalizados y `{link}`.

### R8 — Links cortos
- R8.1 Crear un link corto con destino, alias opcional, dominio y UTM.
- R8.2 Registrar un dominio propio, con instrucciones DNS y verificación.
- R8.3 Cada clic guarda IP, navegador, sistema, dispositivo, idioma, referer, cookies, parámetros y visitante.
- R8.4 Dashboard por link y global: clics y únicos en el tiempo, dispositivos, navegadores, sistemas, países, referers, horas, y tabla de clics recientes.
- R8.5 Exportar los clics a CSV; pausar, caducar y eliminar links.
- R8.6 Los bots no cuentan como clics humanos.

### R9 — Links masivos
- R9.1 Generar un lote de links personales (uno por contacto) desde una lista de contactos.
- R9.2 Generar un lote desde un Excel/CSV.
- R9.3 Descargar el lote con el link de cada fila y el mensaje ya armado para SMS, email o WhatsApp.
- R9.4 `{link}` en una campaña se resuelve al link personal de cada destinatario y el clic queda atribuido al contacto.

### R10 — Lista ⇄ contactos
- R10.1 Desde una lista se buscan y seleccionan contactos para añadirlos.
- R10.2 Desde una lista se quitan varios miembros a la vez.
- R10.3 Desde Clientes: añadir a lista, quitar de lista, asignar, etiquetar y exportar la selección.
- R10.4 En Clientes se ve y se filtra por las listas a las que pertenece cada contacto.

### R11 — Proveedor de SMS
- R11.1 Configuración por empresa de un proveedor HTTP genérico (URL, método, cabeceras, cuerpo, criterio de éxito).
- R11.2 Presets que rellenan el formulario y prueba de envío a un número.
- R11.3 Las credenciales se guardan cifradas y no se devuelven en claro.

## 5. Transversales

- Aislamiento por `tenantId` en todas las consultas nuevas.
- `ToastService` y `ConfirmService` en todas las operaciones; nada de `confirm()` nativo.
- Estilos solo con variables de `styles.scss` y clases de `docs/kitui.md`; íconos `lucide-angular`.
- `npm run build` en backend y frontend sin errores; pruebas unitarias de cada servicio nuevo.
