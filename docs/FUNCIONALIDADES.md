# Maya CRM — Documento funcional completo de la plataforma

> Generado a partir del código fuente del monorepo (`backend/` NestJS + `frontend/` Angular SSR).
> Cada funcionalidad descrita corresponde a controladores, servicios, esquemas y rutas que existen
> hoy en el repositorio.

---

## 1. Qué es la plataforma

Maya CRM (repositorio `maya-bar`) es una **plataforma SaaS multiempresa de CRM, marketing
conversacional y captación de contactos**, orientada a negocios de hostelería, ocio y eventos
(bares, restaurantes, cafeterías) y, tras el reposicionamiento del producto, a **ventas y marketing
por canales de mensajería**.

Tres bloques la definen:

1. **Bandeja omnicanal con agentes de IA** — WhatsApp, Instagram Direct y Facebook Messenger en una
   sola bandeja, con agentes de IA que responden solos (con base de conocimiento propia) y derivan a
   una persona cuando hace falta.
2. **CRM de contactos y oportunidades** — contactos, etiquetas, listas estáticas y dinámicas,
   embudo de seguimiento (leads) con tablero, actividades y recordatorios.
3. **Captación y difusión** — formularios públicos embebibles, eventos con invitación y registro
   público, campañas de email y WhatsApp, y un asistente de recuperación de clientes con IA.

La plataforma conserva además, en reserva, el módulo de **hostelería** completo (carta digital,
pedidos, KDS y reservas): el código, los esquemas y los datos siguen intactos, solo dejaron de
ofrecerse (§ 20).

---

## 2. Arquitectura y stack

| Pieza | Tecnología |
| --- | --- |
| Backend | NestJS 11, TypeScript 5.7, Mongoose 9 sobre MongoDB |
| Tiempo real | Socket.IO 4 (namespaces `/conversations` y `/orders`) |
| Frontend | Angular 21 con SSR (`@angular/ssr`), componentes standalone y signals |
| Iconografía | `lucide-angular` (obligatorio: nunca emojis ni caracteres de texto) |
| App móvil | Capacitor 8 (proyecto Angular `mobile` sin SSR, WebView Android) |
| Notificaciones | Web Push (VAPID, `web-push`) + FCM nativo (`firebase-admin`) |
| Almacenamiento de archivos | S3 compatible (`@aws-sdk`), módulo `upload` |
| Correo | `nodemailer` (módulo `mail`) |
| IA | OpenAI, Anthropic (Claude), DeepSeek y Gemini vía HTTP; embeddings para RAG |
| Tareas programadas | `@nestjs/schedule` (recordatorios de leads, worker de recuperación) |
| Despliegue | Coolify + Cloudflare + GitHub Actions (§ 22) |

### Arranque del backend (`backend/src/main.ts`)

- **Fail-fast sin `JWT_SECRET`**: la aplicación no arranca sin secreto de firma; no hay valor por
  defecto.
- **`ValidationPipe` global** con `whitelist: true` y `transform: true` — recorta propiedades no
  declaradas en los DTO, lo que protege de asignación masiva en los servicios que hacen `$set: dto`.
- **Filtro global de excepciones** (`AllExceptionsFilter`).
- **CORS abierto solo para `/public/forms`**, porque esa API se embebe en landings de terceros. El
  resto de orígenes se controla con `CORS_ORIGINS`/`FRONTEND_URL`, añadiendo siempre
  `https://localhost` y `capacitor://localhost` para que funcione la app nativa.
- DNS forzado a 8.8.8.8 / 1.1.1.1.

---

## 3. Modelo multiempresa (tenants y locales)

### Tenant (empresa)

Colección `tenants`. Campos: `name`, `slug` (único), `ruc`, `email` (único), `phone`, `plan`
(`starter` | `pro` | `enterprise`), `planExpiresAt`, `trialEndsAt`, `branding` (logo, color primario
y secundario) e `isActive`.

Todas las colecciones de negocio llevan `tenantId` indexado y todas las consultas lo filtran: el
aislamiento entre empresas es por dato, no por base de datos.

### Local (sede)

Colección `locals`. Una empresa puede tener varios locales. Campos: `name`, `type` (`restaurant`,
`bar`, `cafe`, `cafeteria`, `fastfood`), dirección, teléfono, email, zona horaria, **horario
semanal** (`hours[]` con día, apertura, cierre y cerrado), número de mesas, `isActive` y
`reservationConfig` (turnos, duración, máximos, antelación, mensajes de bienvenida y política).

Funciones: crear, editar, **clonar** un local completo, archivar (baja lógica) y listar.
Los usuarios se pueden restringir a determinados locales (`user.localIds`), y existe un ámbito de
local (`roles/local-scope.ts`) que acota las consultas.

### Pantalla de plataforma (SUPERADMIN)

`/admin/tenants` — alta y edición de empresas, plan y estado. Es la única ruta protegida por rol
puro (`roleGuard('SUPERADMIN')`) y no por la matriz de módulos, porque SUPERADMIN es un rol de
plataforma y no de empresa. Al entrar, un SUPERADMIN siempre se redirige a `/admin/tenants`.

---

## 4. Autenticación, cuentas y sesión

Endpoints en `/auth`:

| Endpoint | Qué hace |
| --- | --- |
| `POST /auth/login` | Valida credenciales y devuelve access token + refresh token |
| `POST /auth/refresh` | Renueva la sesión a partir del refresh token (colección `refreshtokens`, con expiración y revocación) |
| `POST /auth/logout` | Revoca el refresh token |
| `POST /auth/register` | Alta de empresa: crea el tenant y su usuario `TENANT_ADMIN` y deja la sesión iniciada |
| `PATCH /auth/change-password` | Cambio de contraseña del usuario autenticado |
| `POST /auth/forgot-password` | Envía un código de 6 dígitos por email, válido 15 minutos. Responde siempre igual exista o no el correo (evita enumeración de usuarios) |
| `POST /auth/reset-password` | Restablece la contraseña con el código |

Detalles relevantes:

- **JWT sin permisos dentro**: los permisos no viajan en el token, precisamente para poder revocarlos
  sin esperar a que caduque (§ 5).
- **`ActiveUserCache`**: caché de 60 s de "¿este usuario sigue activo?", para que `JwtStrategy` pueda
  revocar tokens de usuarios desactivados sin una lectura a Mongo por petición.
- **`mustChangePassword`**: un usuario creado por un administrador entra obligatoriamente por
  `/change-password` antes de poder usar la plataforma.
- **Onboarding** (`/onboarding`): asistente de tres pasos tras el alta — tipo de local, datos del
  local y confirmación.
- **Pantalla de entrada por rol**: SUPERADMIN → `/admin/tenants`; el resto va a la primera pantalla
  a la que le den acceso sus módulos (`homeFor`), no a una ruta fija por rol.

---

## 5. Roles, módulos y permisos

El sistema de permisos es una **matriz configurable por empresa**, no una lista fija en el código.

### Catálogo de módulos (`backend/src/roles/modules.catalog.ts`)

Cada módulo es una clave estable ligada a una ruta real del frontend y a unos controladores que
existen: no se pueden inventar módulos desde una pantalla.

| Grupo | Módulos |
| --- | --- |
| **Operaciones** | `dashboard`, `locals`, `events` (+ ocultos: `menu`, `orders`, `kds`, `reservations`) |
| **Clientes** | `customers`, `leads`, `lists`, `forms`, `campaigns`, `templates`, `ai-agents`, `inbox`, `suppression` |
| **Mi actividad** | `impulsador-panel`, `visits`, `my-guests` |
| **Gestión** | `users`, `settings` |

### Roles del sistema

| Clave | Etiqueta |
| --- | --- |
| `SUPERADMIN` | Administrador de plataforma (fuera de la matriz) |
| `TENANT_ADMIN` | Administrador |
| `MANAGER` | Gerente |
| `MARKETING` | Marketing |
| `IMPULSADOR` | Impulsador |
| `HOST` | Anfitrión |
| `SERVER` | Mesero |
| `KITCHEN` | Cocina |
| `BAR` | Barra |

Cada empresa parte de una **matriz por defecto** que reproduce exactamente los accesos que tenía la
plataforma cuando los roles eran fijos, y puede además **crear roles propios** con su propia
selección de módulos y acciones.

### Acciones por módulo

Sobre cada módulo se conceden tres acciones: `create`, `edit`, `delete`. `view` no es una acción
aparte: tener el módulo ya implica verlo. El mapeo con HTTP es directo, así que el guard deduce la
acción del verbo sin anotar endpoint por endpoint:

`POST → create`, `PATCH`/`PUT` → `edit`, `DELETE → delete`, `GET` → sin restricción adicional.

### Barandillas

- **`ADMIN_LOCKED_MODULES`** (`users`, `settings`): el administrador no puede quitárselos, porque
  hacerlo lo dejaría sin la pantalla que permitiría revertirlo. El frontend pinta la casilla
  bloqueada; la regla de verdad la aplica el servidor al guardar.
- **Ámbito por propietario**: `IMPULSADOR` es un rol *owner-scoped* — solo ve sus propios datos.
- **Propagación rápida**: los cambios de permisos se aplican en un intervalo corto y controlado,
  sin esperar a que caduquen los tokens.

### Endpoints

| Endpoint | Qué hace |
| --- | --- |
| `GET /me/permissions` | Módulos y acciones del usuario actual (lo consume el `moduleGuard` del frontend) |
| `GET /roles/catalog` | Catálogo de módulos, acciones y etiquetas |
| `GET /roles` · `POST /roles` · `PATCH /roles/:key` · `DELETE /roles/:key` | Gestión de la matriz y de los roles propios de la empresa |

En el frontend, `/users` incluye la pantalla **matriz de roles** (`roles-matrix.ts`) donde se marcan
módulos y acciones por rol en una sola tabla, leída igual que el menú lateral.

---

## 6. Dashboard

`GET /dashboard/crm` — resumen del CRM resuelto **íntegramente con agregaciones en Mongo** (nunca
trayendo documentos a memoria: un tenant con decenas de miles de contactos lo haría inviable).

Métricas que devuelve:

- **Contactos**: total, nuevos este mes, nuevos el mes anterior, cuántos tienen etiquetas.
- **Conversaciones**: abiertas, sin leer, mensajes sin leer, atendidas por IA, activas hoy.
- **Seguimiento**: estadísticas completas del embudo de leads.
- **Agentes IA**: publicados, total, respuestas de IA vs. respuestas humanas y **porcentaje de
  autonomía** (qué proporción de las respuestas salientes resolvió la IA).
- **Desgloses**: contactos por canal, contactos por etiqueta y conversaciones por canal.

Los canales de alta se etiquetan como WhatsApp, Instagram, Messenger, Formulario, Evento, Reserva,
Alta manual, Importación, Importación externa y API.

---

## 7. Contactos (clientes)

Colección `customers`. Es el núcleo del CRM.

### Ficha del contacto

`name` (obligatorio), `email` y `phone` (ambos opcionales — muchas listas importadas solo traen
teléfono, y la unicidad se resuelve con índices parciales), `tags[]`, `notes`, `createdBy`.

**Trazabilidad del origen**, que es lo que distingue un alta directa de una captada por una landing
externa:

- `source`: `reservation`, `event`, `manual`, `import`, `mongodb`, `form`, `api`, `whatsapp`,
  `instagram`, `messenger`. Se fija al crear y **no se pisa después**.
- `sourceId` — fuente de importación de la que vino.
- `formId` — primer formulario público que lo capturó.
- `formIds[]` — **todos** los formularios por los que ha pasado: la misma persona puede registrarse
  en varias landings sin duplicarse, y se puede filtrar por cualquiera de ellos.
- `sourceLabel` ("Landing Black Friday", "Import CSV enero"), `sourceUrl` (página desde la que se
  envió el formulario).
- `customFields` — campos del origen que no encajan en el modelo, conservados tal cual.
- Contadores: `totalReservations`, `totalEvents`.

### Funciones

| Endpoint | Qué hace |
| --- | --- |
| `GET /customers` | Listado con búsqueda y filtros (etiquetas, origen, formulario) |
| `GET /customers/forms` | Formularios por los que han entrado contactos, para filtrar |
| `POST /customers` | Alta manual |
| `PATCH /customers/:id` · `DELETE /customers/:id` | Edición y baja |
| `POST /customers/sync` | Sincroniza/consolida contactos desde el resto de módulos |
| `GET /customers/export.csv` | Exportación a CSV |

### Importación de contactos (`/customers/import`)

Dos orígenes, ambos con **análisis previo** antes de escribir nada:

**Archivos (XLSX / CSV)**
- `POST /customers/import/file/analyze` — detecta cabeceras, propone el mapeo de columnas
  (nombre, email, teléfono, notas…) y muestra una vista previa.
- `POST /customers/import/file` — importa aplicando el mapeo.

**MongoDB externa**
- `POST /customers/import/mongo/analyze` — conecta a una base externa, infiere los campos y propone
  el mapeo.
- `POST /customers/import/mongo` — importa.
- `GET /customers/import/sources` · `POST /customers/import/sources/:id/run` ·
  `DELETE /customers/import/sources/:id` — las conexiones quedan guardadas como **fuentes
  reutilizables** (`contactsources`), con contadores de importados/actualizados y última ejecución,
  para volver a sincronizar con un clic.

Reglas de la importación:

- **Deduplicación**: identifica por email, por teléfono o por ambos ("con *both* identifica por email
  si lo hay y, si no, por teléfono"). Dentro del mismo archivo, gana la primera aparición.
- **No pisar lo existente**: si se elige no tocar los contactos ya creados, el `$set` se mueve a
  `$setOnInsert` — la importación crea los nuevos sin sobrescribir los viejos.
- **Columnas sin mapear**: se eligen explícitamente cuáles acaban en `customFields`.
- **`bulkWrite` no ordenado**: sigue tras cada fallo, de modo que se aprovecha todo lo escrito.
- **Seguridad de la URI externa**: un `TENANT_ADMIN` podría apuntar a la base de la propia
  plataforma y leer datos de otros tenants, o sondear la red interna. Por eso **se validan y
  bloquean los destinos privados**, salvo que el operador lo permita explícitamente.

---

## 8. Seguimiento (leads / oportunidades)

Embudo de ventas completo sobre las colecciones `leads` y `leadactivities`.

### Etapas (`lead-stages.catalog.ts`)

Viven en el código porque cada una tiene significado para los KPIs y el tablero:

| Etapa | Probabilidad | Desenlace |
| --- | --- | --- |
| Nuevo | 10 % | abierta |
| Contactado | 25 % | abierta |
| Calificado | 45 % | abierta |
| Propuesta | 65 % | abierta |
| Negociación | 80 % | abierta |
| Ganado | 100 % | `won` |
| Perdido | 0 % | `lost` |

La probabilidad alimenta el **valor ponderado del embudo**. El `status` (`open`/`won`/`lost`) se
deriva de la etapa, no se guarda a mano.

### Oportunidad

Ligada siempre a un contacto (`customerId`). Campos: título, descripción, etapa, estado, **valor** y
**moneda** (por defecto `PEN`), **prioridad** (`low`/`medium`/`high`), **propietario** (`ownerId`),
origen, conversación de procedencia (`conversationId`), etiquetas, fechas (creación, cierre
esperado, último contacto, próximo paso) y contador de actividades.

### Actividades e historial

Tipos: `note`, `call`, `whatsapp`, `email`, `meeting`, `task`, `stage_change`, `system`. Los dos
últimos los registra la plataforma sola — nadie los escribe a mano.

Una actividad de tipo `task` con `dueAt` **es** el recordatorio: no hay colección de recordatorios
aparte, porque la tarea del lead ya alimenta el próximo paso del tablero.

### Recordatorios automáticos (`LeadRemindersService`)

Tarea programada que vigila el vencimiento de las tareas y avisa. `remindedAt` impide que el aviso
se repita en cada pasada, y se limpia al cambiar la fecha para que el aviso nuevo vuelva a salir.

### Endpoints

| Endpoint | Qué hace |
| --- | --- |
| `GET /leads/stages` | Catálogo de etapas |
| `GET /leads/board` | Tablero kanban por etapas |
| `GET /leads/stats` | KPIs del embudo |
| `GET /leads/agenda` | Agenda de tareas pendientes del usuario |
| `GET /leads/owners` | Propietarios asignables |
| `GET /leads/customers` | Búsqueda de contactos para crear oportunidad |
| `GET /leads` · `GET /leads/:id` · `POST /leads` · `PATCH /leads/:id` · `DELETE /leads/:id` | CRUD |
| `PATCH /leads/:id/move` | Mover de etapa (registra `stage_change` automáticamente) |
| `GET/POST /leads/:id/activities`, `PATCH`/`DELETE /leads/:id/activities/:activityId` | Historial |

Al crear una oportunidad se puede **crear o reutilizar el contacto** en la misma operación
(`upsertCustomer`).

---

## 9. Listas de contactos

Colección `contactlists`. Dos tipos:

- **Estáticas** — miembros fijos (`memberIds[]`), añadidos y quitados a mano.
- **Dinámicas** — definidas por **reglas** que se evalúan en el momento del envío.

### Reglas de segmentación

| Campo | Operadores |
| --- | --- |
| `tags` | `has_any`, `has_all` |
| `source` | `equals`, `not_equals` |
| `totalReservations` | `gte`, `lte`, `equals` |
| `totalEvents` | `gte`, `lte`, `equals` |
| `daysSinceLastVisit` | `gte`, `lte` |

Cada lista tiene nombre, descripción, color y contador de miembros.

### Endpoints

`GET /lists`, `POST /lists`, `PATCH /lists/:id`, `DELETE /lists/:id`,
`GET /lists/:id/members`, `GET /lists/:id/count`, `POST /lists/:id/members`,
`DELETE /lists/:id/members/:customerId`, `POST /lists/preview-count`, `POST /lists/preview-rules`
(cuántos contactos caerían con unas reglas antes de guardarlas).

---

## 10. Formularios públicos

Colecciones `contactforms` y `formsubmissions`. Permiten que **cualquier landing externa** envíe
contactos a la plataforma.

### Diseño del formulario

Campos configurables con tipo (`text`, `email`, `tel`, `number`, `textarea`, `select`, `checkbox`,
`date`), etiqueta, placeholder, obligatoriedad, opciones (para `select`) y **`mapTo`**: a qué campo
del contacto se vuelca la respuesta (`name`, `email`, `phone`, `notes`, o vacío → `customFields`).

Además: etiquetas que se aplican al contacto creado, listas a las que se le añade automáticamente,
mensaje de agradecimiento, URL de redirección, estado activo/inactivo y contador de envíos.

### Clave pública

`publicKey` identifica el formulario en la URL. **No es un secreto** — queda a la vista en el HTML
de la landing —, por eso la API pública **solo permite escribir contactos y nunca leerlos**. Se
puede regenerar (`POST /forms/:id/regenerate-key`).

### Respuestas automáticas

- **WhatsApp**: usa una **plantilla aprobada**, porque fuera de la ventana de 24 h Meta solo admite
  plantillas y un formulario público casi siempre es un primer contacto. Admite variables con los
  tokens `{nombre}`, `{email}`, `{telefono}` y una multimedia de cabecera.
- **Email**: asunto y cuerpo configurables.

### Endpoints

| Endpoint | Acceso |
| --- | --- |
| `GET /public/forms/:publicKey` | Público (CORS abierto) — definición del formulario |
| `POST /public/forms/:publicKey/submit` | Público — envío |
| `GET /forms`, `GET /forms/:id`, `GET /forms/:id/submissions`, `POST /forms`, `PATCH /forms/:id`, `DELETE /forms/:id`, `POST /forms/:id/regenerate-key` | Privado, módulo `forms` |

---

## 11. Campañas (email y WhatsApp)

Colección `campaigns`.

### Composición

- **Tipo**: `email` o `whatsapp`.
- **Proveedor de WhatsApp**: `waha` (sesión no oficial) o `cloudapi` (API oficial de Meta).
- **Contenido**: asunto (email), cuerpo, **multimedia** (`image`, `video`, `audio`, `document`), o
  **plantilla aprobada** con nombre, idioma y variables (Cloud API).
- **Generación con IA**: `POST /campaigns/generate-email` redacta el email a partir de una
  indicación.

### Segmentación

Tres modos: **todos**, **por etiquetas** o **por listas**. Los tres pasan por el mismo
`resolveCustomers`, así que ninguno puede saltarse el filtro de no contactar (§ 16).

### Vista previa y estimación

- `GET /campaigns/preview` — cómo quedará el mensaje.
- `GET /campaigns/:id/estimate` — a cuántos llegaría, **ya descontando la lista de no contactar**:
  si el número de la pantalla no coincide con el que se envía, nadie se fía de él.

### Envío

- **Cloud API**: envíos en paralelo, sin límite diario. La cabecera multimedia de la plantilla se
  resuelve **una sola vez por campaña**, porque es igual para todos.
- **WAHA**: envío **secuencial** con **límite diario** configurable (`waDailyLimit`, 50 por defecto).
  El proceso es *fire-and-forget*: la respuesta HTTP vuelve de inmediato y el envío sigue en
  segundo plano.
- El límite diario cuenta **lo enviado hoy y lo que está en vuelo**: una campaña en `sending` ya
  reservó su cuota aunque todavía no tenga `sentAt`.
- **Recuperación de campañas huérfanas**: la cola de WAHA vive en memoria, así que al arrancar el
  backend toda campaña que siguiera en `sending` se marca como fallida — de otro modo quedaría
  bloqueada para siempre.
- `POST /campaigns/:id/resend` — reintento; `errors[]` guarda los fallos por destinatario.

Estados: `draft` → `sending` → `sent` | `failed`.

---

## 12. Recuperar clientes (asistente de recuperación con IA)

Colección `recoveryplans`. Es un **asistente de cuatro pasos** que analiza las conversaciones
pasadas, clasifica a cada persona, redacta un mensaje por segmento, crea las plantillas en Meta y
programa el envío por tandas. Todo el estado se guarda, así que se puede cerrar la pantalla y
retomarlo después.

```
analyzing → review → templates → scheduled → sending → done   (o failed)
```

### Paso 1 — Análisis

Se elige una **ventana de tiempo** (7, 15, 30, 60 o 90 días), un contexto libre del negocio y la
zona horaria. La IA recorre las conversaciones y devuelve:

- Titular, resumen y lista de *insights*.
- **Histograma de mensajes entrantes por hora local** (24 posiciones) y **mejor hora** para escribir.
- Cuántas personas están **dentro de la ventana de 24 h** de Meta (a esas se les puede escribir texto
  libre).
- Fase en curso (`queued` → `classifying` → `drafting`) y progreso, para contar en pantalla qué está
  pasando.

### Clasificación de cada persona

| Etapa | Recuperable |
| --- | --- |
| `interesado` | sí |
| `objecion` | sí |
| `vio_precio` | sí |
| `sin_conversacion` | sí |
| `cliente` | no |
| `no_encaja` | no |
| `no_contactar` | no |
| `en_curso` | no |

De cada destinatario se guarda nombre, teléfono, fecha del último mensaje, **lo que la IA entendió de
la conversación en una frase**, si está dentro de la ventana de 24 h y, en los excluidos, el motivo.

### Paso 2 — Revisión de segmentos

Cada segmento tiene nombre, descripción, **estrategia** (por qué se les escribe así), color, color de
badge, lista editable de destinatarios y el mensaje. Se pueden activar y desactivar segmentos,
mover destinatarios y **pedir a la IA que reescriba el mensaje** con una instrucción
(`POST /recovery/:id/segments/:key/rewrite`), lo que lanza un trabajo en segundo plano con su propio
estado (`pending`/`running`/`done`/`failed`).

### Paso 3 — Plantillas

`POST /recovery/:id/templates` crea las plantillas en Meta y `POST /recovery/:id/templates/refresh`
consulta su estado de aprobación. Se guardan `templateName`, `templateId`, el cuerpo con el que se
creó (para detectar ediciones posteriores), el estado, el motivo de rechazo y los errores de
creación, que son distintos de un rechazo de revisión.

### Paso 4 — Programación y envío

`PUT /recovery/:id/schedule` fija fecha y hora y la **cadencia por tandas**: tamaño de la primera
tanda, pausa tras ella, tamaño de las siguientes e intervalo entre ellas. Un **worker**
(`RecoveryWorkerService`) recorre los planes programados, envía la tanda que toca, calcula
`nextBatchAt` y registra el estado por destinatario (`pending`/`sent`/`failed`/`skipped`).
`POST /recovery/:id/cancel` detiene el plan.

Otros: `POST /recovery/:id/reanalyze` repite el análisis; `GET /recovery`, `GET /recovery/:id`,
`PATCH /recovery/:id`, `DELETE /recovery/:id`.

---

## 13. Plantillas de WhatsApp

Colección `watemplates`. Gestión de las plantillas de la Cloud API de Meta desde la plataforma.

- `GET /whatsapp-templates` — listado, filtrable por cuenta.
- `GET /whatsapp-templates/accounts` — cuentas de WhatsApp con Cloud API disponibles.
- `POST /whatsapp-templates/sync` — **sincroniza con Meta**: trae las plantillas reales y su estado.
- `POST /whatsapp-templates`, `PATCH /:id`, `DELETE /:id` — crear, editar y borrar (también en Meta).

Cada plantilla guarda nombre, idioma, **categoría** (`MARKETING`, `UTILITY`, `AUTHENTICATION`),
**estado** (`PENDING`, aprobada, rechazada…), motivo de rechazo, componentes (`components[]`) y el
cuerpo. El servicio resuelve además la **cabecera multimedia** en el momento del envío
(`resolveSendHeader`).

---

## 14. Agentes de IA

Colecciones `aiagents`, `knowledgedocs`, `knowledgechunks`, `agentfiles`.

### Configuración del agente

| Ajuste | Detalle |
| --- | --- |
| Identidad | Nombre, descripción, **prompt de sistema**, saludo inicial opcional |
| Proveedor | `auto`, `openai`, `claude`, `deepseek`, `gemini` |
| Modelo | Elegido del catálogo **en vivo** del proveedor (§ 14.3) |
| Parámetros | `temperature` (0.4 por defecto), `maxTokens` (800) |
| Respaldo | `fallbackMessage` cuando no sabe responder |
| RAG | `ragEnabled` y `topK` (5 por defecto) |
| Canales | Cuentas de WhatsApp, de Instagram y páginas de Messenger por las que responde |
| Publicación | `published` — solo un agente publicado atiende conversaciones |

### Base de conocimiento (RAG)

- **Documentos** (`POST /ai-agents/:id/docs`) y **archivos** (`POST /ai-agents/:id/files`).
- `RagService` extrae el texto del archivo, lo **trocea**, genera **embeddings** por trozo y los
  guarda en `knowledgechunks` con su vector.
- Cada documento tiene estado `processing` → `ready` | `error`, con contadores de trozos.
- En cada respuesta se recuperan los `topK` trozos más cercanos y se inyectan en el prompt.
- Borrar un documento o un agente borra sus trozos.

### Escalamiento a una persona (handoff)

Configurable por agente:

- `handoffEnabled` habilita el token `{{HANDOFF}}`: el agente puede derivar el chat.
- `handoffInstructions` — criterios de escalamiento, que se **inyectan en el prompt de sistema**.
- `handoffNumbers[]` — números (E.164 sin `+`) que reciben el aviso por WhatsApp.
- `handoffAccountId` — cuenta desde la que sale el aviso; si no se indica, la de la conversación o
  la predeterminada del tenant.
- `handoffMessage` — lo que se le responde al cliente al derivar, si el agente no escribió nada.
- `handoffTemplateName` / `handoffTemplateLang` — plantilla de Cloud API para el aviso cuando la
  persona no escribió al número en las últimas 24 h (Meta bloquea el texto libre). Debe tener tres
  variables: cliente, motivo y enlace.

El `HandoffService` construye el aviso con **enlace directo al chat en la plataforma**.

### Prueba y catálogo de modelos

- `POST /ai-agents/:id/test` — chat de prueba contra el agente, sin tocar conversaciones reales.
- `GET /ai-agents/models?provider=…` — el selector **no trae una lista fija**: el backend consulta el
  catálogo real del proveedor con la API key del tenant y muestra lo que esa cuenta puede usar hoy.
  Se descarta lo que no sirve para conversar (embeddings, audio, imagen, moderación, rerank) y se
  ordenan primero los modelos recomendados de `ai-models.catalog.ts`, que es también el respaldo
  cuando la consulta falla. Si el agente tiene guardado un modelo que ya no se sirve, se puede
  escribir el id a mano.

Proveedor **Automático**: usa la primera API key configurada en el orden DeepSeek → Claude → OpenAI
→ Gemini, con el modelo por defecto de cada uno.

---

## 15. Conversaciones (bandeja omnicanal)

Colecciones `conversations` y `messages`. Es el módulo más grande de la plataforma
(`conversations.service.ts`, ~1.500 líneas).

### Canales

WhatsApp (WAHA y Cloud API), Instagram Direct y Facebook Messenger, unificados en una misma bandeja.

### Conversación

Canal, cuenta por la que entra, agente asignado, identificador externo del contacto, nombre, foto,
último mensaje y su dirección, no leídos, **auto-respuesta activada o no**, usuario asignado, estado
(`open`/`closed`), contacto vinculado del CRM, **marca de no contactar**, notas y **etiquetas**.

### Mensaje

Dirección (`in`/`out`), **autor** (`customer`, `agent`, `human`, `system`) — lo que permite medir la
autonomía de la IA —, tipo (texto, imagen, audio, vídeo, documento, ubicación…), contenido, media
(url, clave, mime, nombre, tamaño, duración), ubicación (lat/lng/nombre), id externo, mensaje citado,
**estado de entrega** (`pending`, `sent`, `delivered`, `read`, `failed`) y quién lo envió.

### Funciones de la bandeja

| Endpoint | Qué hace |
| --- | --- |
| `GET /conversations` | Listado con filtros por cuenta, canal, estado, etiquetas y no leídos |
| `GET /conversations/accounts` | Cuentas conectadas, para filtrar |
| `GET /conversations/tags` | Etiquetas en uso |
| `GET /conversations/unread-count` | Contador global (alimenta el badge del menú) |
| `GET /conversations/:id` · `GET /conversations/:id/messages` | Detalle e historial |
| `POST /conversations/:id/messages` | Responder a mano (texto o multimedia) |
| `PATCH /conversations/:id/read` | Marcar como leída |
| `PATCH /conversations/:id/auto-reply` | Activar/desactivar la IA en esa conversación |
| `PATCH /conversations/:id/status` | Abrir / cerrar |
| `PATCH /conversations/:id/tags` | Etiquetar |
| `POST /conversations/:id/contact` · `GET /conversations/:id/contact` | Crear o consultar el contacto del CRM desde el chat |
| `POST /conversations/:id/lead` | **Crear una oportunidad** desde el chat |
| `PATCH /conversations/:id/do-not-contact` | Dar de baja a esa persona |
| `DELETE /conversations/:id` | Borrar |

Desde el propio chat se ve la **ficha CRM** del contacto (`crmCard`), con sus oportunidades nombradas
por etapa del embudo.

### Entrada de mensajes (webhooks)

| Webhook | Ruta |
| --- | --- |
| WhatsApp Cloud API (global) | `GET/POST /wa/webhook/cloud` |
| WhatsApp Cloud API (por cuenta) | `GET/POST /wa/webhook/cloud/:accountId` |
| WhatsApp WAHA | `POST /wa/webhook/waha/:accountId` |
| Instagram | `GET/POST /ig/webhook` |
| Messenger | `GET/POST /messenger/webhook` |

Al entrar un mensaje: se crea o actualiza la conversación, se descarga la multimedia, se resuelve el
perfil del contacto, se comprueba la **lista de no contactar** (si está, la IA no responde), responde
el agente publicado de esa cuenta si la auto-respuesta está activa, y se emite el evento en tiempo
real y la notificación push.

Los acuses de recibo de Meta actualizan el estado de entrega (`handleAck`).

### Tiempo real

Gateway Socket.IO en el namespace `/conversations`, con sala por tenant y eventos
`message:new`, `message:updated`, `conversation:updated` y `conversation:typing`.

---

## 16. No contactar (supresión)

Colección `suppressionentries`. Quien pide dejar de recibir comunicaciones se marca **una vez** y
deja de entrar en **todas** las campañas, y el agente de IA deja de responderle.

### Por qué es una colección aparte

Una marca en la ficha del contacto se perdería en cuanto: se reimporta un CSV (la importación hace
`bulkWrite` de upserts), alguien borra la ficha y la vuelve a crear, o la misma persona entra otra
vez por otro canal y genera un contacto nuevo. Por eso la baja vive en su propia colección,
**indexada por el dato de contacto normalizado** (teléfono en dígitos, email en minúsculas) y
sobrevive a la ficha. La normalización es la misma del CRM (`shared/phone.ts`), así que
`+51 999 888 777`, `999888777` y `51999888777` son la misma persona.

### Dónde se aplica

| Salida | Qué pasa |
| --- | --- |
| Campañas (WhatsApp y email) | Bloqueo duro: nunca se envía |
| Recuento previo de la campaña | Lo descuenta y lo dice en pantalla |
| Agente IA | Deja de responder automáticamente |
| Respuesta manual | **Se permite**, con aviso visible en el chat |

El filtro de campañas está en `resolveCustomers` a propósito: por ahí pasan las tres formas de
segmentar, así que ninguna se lo puede saltar, y una cuarta heredaría el bloqueo sola.

### Endpoints

`GET /suppression` (con búsqueda), `GET /suppression/count`, `POST /suppression` (alta manual o desde
la conversación), `DELETE /suppression/:id`. Cada entrada guarda teléfono, email, nombre, motivo,
**origen** de la baja (`inbox`, `manual`, `import`, `reply`), quién la registró y de qué conversación
vino. Los índices se crean solos al
arrancar: no necesita configuración.

---

## 17. Eventos

Colecciones `events`, `eventregistrations`, `eventtemplates`, `externalimpulsadores`.

### El evento

Local, título, descripción, fecha, hora de inicio y fin, **aforo**, precio, imagen, estado
(`draft` / `published` / `cancelled`), **slug único** para la URL pública, creador, **compartido con**
usuarios concretos o con todos, **archivos multimedia**, **campos de formulario propios** del evento
(texto, área, select, checkbox, número, email, teléfono, fecha) y **diseño de la invitación**.

### Diseñador de invitación

`invitation-designer.ts` en el frontend, con el diseño guardado en `invitationDesign` y generable con
IA (`POST /events/ai-design`).

### Generación con IA

| Endpoint | Qué genera |
| --- | --- |
| `POST /events/ai-generate` | El evento entero a partir de una indicación |
| `POST /events/ai-design` | El diseño de la invitación |
| `POST /events/:id/generate-copy` | Texto del evento |
| `POST /events/:id/generate-social` | Publicaciones para redes |
| `POST /events/:id/generate-hashtags` | Hashtags |
| `POST /events/:id/generate-email` | Email de convocatoria |

### Plantillas de evento

`GET/POST /event-templates`, `DELETE /event-templates/:id` — guardar una configuración de evento para
reutilizarla.

### Registro público

- `GET /public/events/:slug` — página pública del evento (`/e/:slug` en el frontend).
- `POST /public/events/:id/register` — inscripción. Crea la `EventRegistration` con nombre, email,
  teléfono, **número de acompañantes**, **código de confirmación único**, estado
  (`confirmed`/`cancelled`), respuestas a los campos personalizados y **atribución al impulsador**.
- Se envía un email de confirmación (`MailService.sendEventConfirmationEmail`).

### Check-in

- `GET /events/:id/registrations` — listado y búsqueda de inscritos.
- `PATCH /events/:id/registrations/:regId/check-in` — check-in desde la lista.
- `PATCH /events/:id/registrations/check-in/by-code` — check-in por **código**, para la puerta.

### Impulsadores y atribución

- `GET /events/:id/impulsadores` — usuarios con rol `IMPULSADOR` de la empresa **más** los
  impulsadores externos, cada uno con su código de referido.
- `POST /impulsadores/external` · `DELETE /impulsadores/external/:extId` — impulsadores **externos**
  (personas que no son usuarios de la plataforma) con código propio.
- `resolveAttribution` asigna cada registro público al impulsador del `referralCode` de la URL.

### Pestañas de la pantalla de evento

General, Media, Formulario, Impulsadores, Marketing, Registros, Check-in y Estadísticas.

---

## 18. Mi actividad (impulsadores)

Tres módulos para el rol `IMPULSADOR`, cuyos datos están acotados a su propietario.

### Mi Panel (`/impulsador`)

- `GET /impulsador/registrations` — todos los inscritos de los eventos que creó.
- `POST /impulsador/registrations/:regId/message` — **mensaje directo** al inscrito (WhatsApp/email).
- `PATCH /impulsador/registrations/:regId/check-in` — check-in desde el panel.

### Visitas (`/visitas`)

Registro de visitas comerciales **con geolocalización**. Colección `visits`: referencia, coordenadas
(`lat`, `lng`, `accuracy`) y dirección.

`POST /visits`, `GET /visits`, `GET /visits/stats` (estadísticas por impulsador y periodo),
`DELETE /visits/:id`.

### Mis Asistentes (`/mis-asistentes`)

Los inscritos atribuidos al impulsador a través de su código de referido, con su estado de check-in.

---

## 19. Usuarios y configuración

### Usuarios (`/users`)

| Endpoint | Qué hace |
| --- | --- |
| `GET /users` | Usuarios de la empresa |
| `POST /users` | Alta (con `mustChangePassword` en el primer acceso) |
| `PATCH /users/:id` | Edición: nombre, rol, locales asignados, estado |
| `GET /users/:id/impact` | **Impacto de borrar** ese usuario: qué quedaría huérfano (eventos, leads, contactos, listas…) |
| `GET /users/:id/reassign-candidates` | A quién se le puede reasignar su trabajo |
| `DELETE /users/:id` | Baja, con reasignación previa |

El borrado no es ciego: primero se muestra qué arrastra y se ofrece reasignar.
En la misma pantalla vive la **matriz de roles** (§ 5).

### Configuración (`/settings`)

- **Notificaciones push** (solo dentro de la app nativa).
- **Cuentas de WhatsApp** — alta, OAuth, QR, estado, prueba, predeterminada.
- **Cuentas de Instagram**.
- **Páginas de Messenger**.
- **Inteligencia artificial** — API keys de OpenAI, DeepSeek, Gemini y Claude (guardadas por tenant
  en `tenantconfigs`, ocultas tras un campo de contraseña con botón de mostrar).

`GET /settings`, `PUT /settings`, `GET /settings/whatsapp/status`, `GET /settings/whatsapp/qr`,
`POST /settings/whatsapp/test`.

---

## 20. Canales e integraciones

### WhatsApp

Dos proveedores por cuenta (`whatsappaccounts`):

| Proveedor | Cómo |
| --- | --- |
| **WAHA** | Sesión propia: `wahaApiUrl`, `wahaApiKey`, `wahaSession`. Vinculación por **QR**. Límite diario de envíos |
| **Cloud API** | Oficial de Meta: `waPhoneNumberId`, `waAccessToken`, `waBusinessAccountId`, `waVerifyToken`. Plantillas, ventana de 24 h, acuses de recibo |

Funciones: `GET /whatsapp-accounts`, `POST`, `PATCH /:id`, `DELETE /:id`, `PATCH /:id/default`,
`GET /:id/status`, `GET /:id/qr`, `POST /:id/test`, `POST /:id/webhook` (configura el webhook en
Meta), `GET /webhook-url`.

**Onboarding por OAuth (Embedded Signup)**: `GET /whatsapp-accounts/oauth/config`,
`POST /whatsapp-accounts/oauth/connect`, `POST /whatsapp-accounts/:id/oauth/refresh`. El servicio
intercambia el código, obtiene el token de larga duración, **registra el número** (con PIN interno de
verificación en dos pasos, que el usuario final no ve) y trae su información.

Capacidades del servicio de WhatsApp: enviar mensaje (texto y multimedia), enviar plantilla de Cloud
API, **descargar multimedia** de Cloud API y de WAHA, marcar como leído, indicador de escritura,
estado de la cuenta, asegurar/registrar webhook, obtener QR y normalizar teléfonos.

### Instagram Direct

Colección `instagramaccounts`. Usa **Instagram API with Instagram Login** — no requiere una Página de
Facebook vinculada (el `pageId` queda solo como dato heredado).

OAuth completo: `GET /instagram-accounts/oauth/start` → `GET /instagram-accounts/oauth/callback` →
token de larga duración, con `POST /:id/oauth/refresh` para renovarlo. El `state` va firmado y se
verifica.

Además: `POST /:id/subscribe` (suscribir el webhook), `GET /:id/status`, `POST /:id/test`,
`PATCH /:id/default`, `GET /webhook-url`. El servicio envía mensajes y **resuelve el perfil del
contacto**.

### Facebook Messenger

Colección `messengeraccounts`. OAuth (`/messenger-accounts/oauth/start` y `/callback`), **listado de
páginas** del usuario para elegir cuál conectar, suscripción del webhook, estado, prueba, cuenta
predeterminada. El servicio envía mensajes, marca *typing*, marca visto y resuelve el perfil.

### Cliente común de Meta

`shared/meta-graph.client.ts` centraliza las llamadas a la Graph API de los tres canales.

### Almacenamiento y correo

- `POST /upload` — subida de archivos a S3 (imágenes de eventos, multimedia de campañas, archivos de
  agentes, cabeceras de plantillas).
- `MailService` — recuperación de contraseña, confirmación de reserva, confirmación de evento y envío
  de campañas de email.

---

## 21. Notificaciones y tiempo real

### Web Push (VAPID)

Módulo `push`. Cada mensaje nuevo de Conversaciones llega al móvil del equipo como notificación
nativa aunque la plataforma esté cerrada, si se instaló como acceso directo. **Sin servicios de
terceros**: Web Push estándar, que es lo que hablan directamente Chrome/Android y Safari/iOS 16.4+.

```
mensaje entrante → ConversationsService.ingestInbound()
  → PushService.sendToTenant(..., { moduleKey: 'inbox' })
  → servicio de push del navegador (FCM / APNs / Mozilla)
  → public/sw.js → showNotification()
  → al tocarla: /inbox?c=<conversationId>
```

Endpoints: `GET /push/public-key`, `GET /push/status`, `POST /push/subscribe`,
`DELETE /push/subscribe`, `POST /push/test`. Sin `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` el backend
arranca igual y las notificaciones quedan desactivadas.

El envío es **por módulo**: solo reciben el aviso los usuarios cuyo rol tiene concedido el módulo
correspondiente (`sendToTenantModule`).

### Push nativo (FCM)

Módulo `notifications`, para la app Android: `GET /devices/status`, `POST /devices` (registro del
token), `DELETE /devices/:token`. Usa `firebase-admin`, y normaliza la clave privada venga como venga
del entorno (en `.env` va en una línea con `\n` escapados, que al pasar por docker-compose pueden
llegar duplicados o entrecomillados).

### WebSockets

| Namespace | Eventos |
| --- | --- |
| `/conversations` | `message:new`, `message:updated`, `conversation:updated`, `conversation:typing` (sala por tenant) |
| `/orders` | `order:new`, `order:updated` (sala por tenant + local) |

---

## 22. Módulos de hostelería (en reserva)

Al reposicionar el producto como CRM de ventas y marketing, cuatro módulos se retiraron del menú
mediante `HIDDEN_MODULES`. **El código, los esquemas y los datos siguen intactos**: vaciar esa lista
en el backend y volver a registrar las rutas en `app.routes.ts` los reactiva.

### Carta digital (`menu`)

Categorías y artículos por local: nombre, descripción, precio, fotos, **variantes** (con modificador
de precio), **modificadores** (con mínimo y máximo de opciones), **alérgenos**, **etiquetas
dietéticas**, **estaciones** (`kitchen`, `bar`, `desserts`), disponibilidad y orden.
Reordenación por arrastre (`PATCH /menu/categories/reorder`, `PATCH /menu/items/reorder`) y conmutador
rápido de disponibilidad.

### Pedidos (`orders`)

Pedido con local, **número de mesa**, **tipo** (`dine-in`…), estado, líneas (artículo, cantidad,
notas, estaciones y subtotal), subtotal, total, notas, nombre del comensal, **historial de estados**
(`statusHistory`) y avisos de **llamar al mesero** (`callWaiter`) y **pedir la cuenta** (`callBill`).

Público (QR en la mesa): `GET /public/menu`, `POST /public/orders`, `GET /public/orders/:id`
(seguimiento del pedido), `POST /public/orders/:id/call-waiter`, `POST /public/orders/:id/call-bill`.
Privado: `GET /orders`, `GET /orders/tables`, `PATCH /orders/:id/status`, `PATCH /orders/:id`,
`DELETE /orders/:id`.

### KDS (`kds`)

Pantalla de cocina en tiempo real por estación, alimentada por el gateway `/orders`.

### Reservas (`reservations`)

Configuración por local: turnos, duración, máximo por turno, tamaño máximo de grupo, antelación,
mensaje de bienvenida y política.

Público: `GET /public/reservations/availability` (disponibilidad por fecha y turno),
`GET /public/reservations/config`, `POST /public/reservations`, `GET /public/reservations/:token`,
`PATCH /public/reservations/:token/confirm` (confirmación por enlace con token único).
Privado: `GET /reservations`, `PATCH /reservations/:id/status`, `GET/PUT /reservations/config`.

La reserva guarda fecha (`YYYY-MM-DD`), turno (`HH:MM`), número de comensales, nombre, email y
teléfono del cliente, **ocasión**, notas, estado, historial de estados, **token de confirmación**
único y los indicadores de recordatorio enviado (`reminderSent`) y confirmación solicitada
(`confirmationRequested`).

---

## 23. Páginas públicas y app móvil

### Rutas públicas del frontend

| Ruta | Qué es |
| --- | --- |
| `/` | Landing comercial. **Es la única ruta prerenderizada** (SSG); vive fuera del Shell |
| `/login`, `/register` | Acceso y alta de empresa |
| `/change-password` | Cambio obligatorio en el primer acceso |
| `/onboarding` | Asistente de tres pasos tras el alta |
| `/e/:slug` | Página pública del evento e inscripción |

Las páginas públicas de hostelería (carta por QR, seguimiento de pedido, reserva) siguen en el
repositorio sin ruta registrada.

### Carga y rendimiento

Todas las páginas se cargan bajo demanda con `loadComponent`. Importarlas de forma estática metía la
aplicación entera —diseñador de invitaciones, editor de campañas, bandeja— en el bundle inicial, que
es justo lo que descarga un móvil con datos antes de ver el login. El Shell sí va estático: es el
marco de todas las pantallas privadas.

### Interfaz

- **Menú lateral** agrupado (Operaciones / Clientes / Gestión, o Mi actividad / Mis clientes para el
  impulsador), colapsable, con badges de no leídos.
- **Barra inferior en móvil** con las cuatro entradas prioritarias según el rol y una hoja "Más" con
  el resto.
- Componentes compartidos registrados en la raíz: `<app-progress-bar>` (barra de carga automática por
  interceptor), `<app-toast>` (notificaciones), `<app-confirm>` (confirmaciones con promesa),
  banner de sin conexión y centro de notificaciones.
- Guardas: `authGuard`, `moduleGuard(<módulo>)`, `roleGuard('SUPERADMIN')` y `rootEntryGuard` (que
  solo actúa dentro de la app nativa, donde `/` debe llevar a la aplicación y no a la landing).

### App Android (Capacitor)

La app empaqueta el mismo frontend Angular dentro de un WebView. No es un proyecto aparte: comparte
código, rutas y componentes con la web. Usa el proyecto Angular **`mobile`** (build estático sin SSR,
porque el output de SSR no sirve dentro de un WebView). Incluye push por FCM, permisos de
dispositivo (ubicación para las visitas, notificaciones) y gestión del botón atrás nativo.

---

## 24. Seguridad

- **Aislamiento por tenant** en toda consulta, con `tenantId` indexado.
- **JWT sin permisos embebidos** + caché corta de usuario activo: revocar un acceso surte efecto en
  menos de un minuto, sin esperar a que caduque el token.
- **`ValidationPipe` con `whitelist`**: los DTO recortan lo que no declaran, lo que impide asignación
  masiva en los `$set: dto`.
- **`JWT_SECRET` obligatorio**: sin él la aplicación no arranca.
- **CORS acotado**, abierto solo en `/public/forms`, que por diseño solo escribe y nunca lee.
- **Clave pública de formulario que no es un secreto**: por eso la API pública no expone contactos.
- **Bloqueo de destinos privados** al importar desde una MongoDB externa, para que un administrador de
  empresa no pueda leer datos de otros tenants ni sondear la red interna.
- **No enumeración de usuarios** en la recuperación de contraseña.
- **Lista de no contactar** persistente e independiente de la ficha del contacto.
- **Barandillas de permisos** que impiden que un administrador se deje fuera de su propia empresa.
- **Impacto de borrado visible** antes de eliminar un usuario.

---

## 25. Despliegue

Monorepo con dos aplicaciones desplegadas en la misma instancia de **Coolify**, cada una desde su
propio `Dockerfile`:

| App | Ruta | Dominio | Puerto |
| --- | --- | --- | --- |
| Backend | `backend/` | `api.mayacrm.site` | 3080 |
| Frontend | `frontend/` | `mayacrm.site` (+ `www`) | 4000 |

El frontend es Angular con SSR: la imagen final ejecuta el servidor Express que genera
`@angular/build`, no un nginx estático.

**DNS (Cloudflare, sin túnel)**: registros A directos al servidor, en gris (`proxied: false`), porque
Traefik emite los certificados por el reto HTTP-01 de Let's Encrypt y el proxy naranja lo
interceptaría.

**Scripts de infraestructura** (raíz del repositorio):

```bash
npm run dns:check        # informa diferencias de DNS, no escribe
npm run dns              # crea/actualiza los registros
npm run coolify:list     # proyectos, servidores, GitHub Apps y aplicaciones
npm run provision:check  # dry-run del aprovisionamiento
npm run provision        # aplica; imprime los UUID para los secrets
npm run deploy           # despliega ambas; también deploy:backend / deploy:frontend
```

**CI/CD** (`.github/workflows/deploy.yml`, en cada push a `main`): detecta qué cambió
(`backend/`, `frontend/` o infraestructura común), ejecuta lint, typecheck, tests y build solo de lo
afectado, y despliega únicamente si CI pasa. El auto-deploy de Coolify queda desactivado para que el
único disparador sea GitHub Actions.

---

## 26. Mapa completo de la API

### Público (sin autenticación)

```
GET    /public/forms/:publicKey
POST   /public/forms/:publicKey/submit
GET    /public/events/:slug
POST   /public/events/:id/register
GET    /public/menu                                  (hostelería, en reserva)
POST   /public/orders                                (hostelería, en reserva)
GET    /public/orders/:id
POST   /public/orders/:id/call-waiter
POST   /public/orders/:id/call-bill
GET    /public/reservations/availability             (hostelería, en reserva)
GET    /public/reservations/config
POST   /public/reservations
GET    /public/reservations/:token
PATCH  /public/reservations/:token/confirm
```

### Webhooks

```
GET|POST /wa/webhook/cloud
GET|POST /wa/webhook/cloud/:accountId
POST     /wa/webhook/waha/:accountId
GET|POST /ig/webhook
GET|POST /messenger/webhook
GET      /instagram-accounts/oauth/callback
GET      /messenger-accounts/oauth/callback
```

### Autenticado

```
# Auth
POST   /auth/login | /auth/refresh | /auth/logout | /auth/register
PATCH  /auth/change-password
POST   /auth/forgot-password | /auth/reset-password

# Permisos y roles
GET    /me/permissions | /roles/catalog | /roles
POST   /roles          PATCH /roles/:key      DELETE /roles/:key

# Empresas, locales, usuarios
GET    /tenants | /tenants/me      POST /tenants    PATCH /tenants/:id | /tenants/me
GET    /locals | /locals/:id       POST /locals | /locals/:id/clone
PATCH  /locals/:id                 DELETE /locals/:id
GET    /users | /users/:id/impact | /users/:id/reassign-candidates
POST   /users     PATCH /users/:id     DELETE /users/:id

# Dashboard
GET    /dashboard/crm

# Contactos e importación
GET    /customers | /customers/forms | /customers/export.csv
POST   /customers | /customers/sync     PATCH /customers/:id    DELETE /customers/:id
POST   /customers/import/file/analyze | /customers/import/file
POST   /customers/import/mongo/analyze | /customers/import/mongo
GET    /customers/import/sources        POST /customers/import/sources/:id/run
DELETE /customers/import/sources/:id

# Seguimiento
GET    /leads | /leads/stages | /leads/board | /leads/stats | /leads/agenda
GET    /leads/owners | /leads/customers | /leads/:id | /leads/:id/activities
POST   /leads | /leads/:id/activities
PATCH  /leads/:id | /leads/:id/move | /leads/:id/activities/:activityId
DELETE /leads/:id | /leads/:id/activities/:activityId

# Listas
GET    /lists | /lists/:id/members | /lists/:id/count
POST   /lists | /lists/preview-count | /lists/preview-rules | /lists/:id/members
PATCH  /lists/:id     DELETE /lists/:id | /lists/:id/members/:customerId

# Formularios
GET    /forms | /forms/:id | /forms/:id/submissions
POST   /forms | /forms/:id/regenerate-key
PATCH  /forms/:id     DELETE /forms/:id

# Campañas y recuperación
GET    /campaigns | /campaigns/preview | /campaigns/:id/estimate
POST   /campaigns | /campaigns/generate-email | /campaigns/:id/send | /campaigns/:id/resend
PATCH  /campaigns/:id     DELETE /campaigns/:id
GET    /recovery | /recovery/:id
POST   /recovery | /recovery/:id/reanalyze | /recovery/:id/cancel
POST   /recovery/:id/segments/:key/rewrite | /recovery/:id/templates | /recovery/:id/templates/refresh
PUT    /recovery/:id/schedule      PATCH /recovery/:id      DELETE /recovery/:id

# Plantillas de WhatsApp
GET    /whatsapp-templates | /whatsapp-templates/accounts
POST   /whatsapp-templates | /whatsapp-templates/sync
PATCH  /whatsapp-templates/:id     DELETE /whatsapp-templates/:id

# Agentes IA
GET    /ai-agents | /ai-agents/models | /ai-agents/:id | /ai-agents/:id/docs | /ai-agents/:id/files
POST   /ai-agents | /ai-agents/:id/docs | /ai-agents/:id/files | /ai-agents/:id/test
PATCH  /ai-agents/:id
DELETE /ai-agents/:id | /ai-agents/:id/docs/:docId | /ai-agents/:id/files/:fileId

# Conversaciones
GET    /conversations | /conversations/accounts | /conversations/tags | /conversations/unread-count
GET    /conversations/:id | /conversations/:id/messages | /conversations/:id/contact
POST   /conversations/:id/messages | /conversations/:id/contact | /conversations/:id/lead
PATCH  /conversations/:id/tags | /do-not-contact | /read | /auto-reply | /status
DELETE /conversations/:id

# No contactar
GET    /suppression | /suppression/count     POST /suppression     DELETE /suppression/:id

# Eventos
GET    /events | /events/:id | /events/:id/registrations | /events/:id/impulsadores | /event-templates
POST   /events | /events/ai-generate | /events/ai-design | /event-templates
POST   /events/:id/generate-copy | /generate-social | /generate-hashtags | /generate-email
POST   /impulsadores/external
PATCH  /events/:id | /events/:id/share
PATCH  /events/:id/registrations/:regId/check-in | /events/:id/registrations/check-in/by-code
DELETE /events/:id | /event-templates/:id | /impulsadores/external/:extId

# Impulsador y visitas
GET    /impulsador/registrations
POST   /impulsador/registrations/:regId/message
PATCH  /impulsador/registrations/:regId/check-in
GET    /visits | /visits/stats    POST /visits    DELETE /visits/:id

# Canales
GET    /whatsapp-accounts | /oauth/config | /webhook-url | /:id/status | /:id/qr
POST   /whatsapp-accounts | /oauth/connect | /:id/oauth/refresh | /:id/test | /:id/webhook
PATCH  /whatsapp-accounts/:id | /:id/default     DELETE /whatsapp-accounts/:id
GET    /instagram-accounts | /oauth/start | /webhook-url | /:id/status
POST   /instagram-accounts | /:id/oauth/refresh | /:id/subscribe | /:id/test
PATCH  /instagram-accounts/:id | /:id/default    DELETE /instagram-accounts/:id
GET    /messenger-accounts | /oauth/start | /webhook-url | /:id/status
POST   /messenger-accounts | /:id/subscribe | /:id/test
PATCH  /messenger-accounts/:id | /:id/default    DELETE /messenger-accounts/:id
GET    /whatsapp/status | /whatsapp/qr

# Ajustes, archivos y notificaciones
GET    /settings | /settings/whatsapp/status | /settings/whatsapp/qr
PUT    /settings      POST /settings/whatsapp/test
POST   /upload
GET    /push/public-key | /push/status      POST /push/subscribe | /push/test
DELETE /push/subscribe
GET    /devices/status      POST /devices      DELETE /devices/:token

# Hostelería (en reserva)
GET    /menu/categories | /menu/items        POST /menu/categories | /menu/items
PATCH  /menu/categories/reorder | /menu/categories/:id | /menu/items/reorder
PATCH  /menu/items/:id | /menu/items/:id/availability
DELETE /menu/categories/:id | /menu/items/:id
GET    /orders | /orders/tables    PATCH /orders/:id | /orders/:id/status   DELETE /orders/:id
GET    /reservations | /reservations/config   PATCH /reservations/:id/status   PUT /reservations/config
```

---

## 27. Colecciones de MongoDB

| Colección | Contenido |
| --- | --- |
| `tenants` | Empresas |
| `locals` | Locales/sedes |
| `users` | Usuarios y su rol, locales y código de referido |
| `refreshtokens` | Sesiones renovables |
| `roles` | Matriz de módulos y acciones por rol y empresa |
| `tenantconfigs` | Ajustes e integraciones por empresa (API keys de IA, WhatsApp) |
| `customers` | Contactos del CRM |
| `contactsources` | Fuentes de importación reutilizables |
| `contactlists` | Listas estáticas y dinámicas |
| `leads`, `leadactivities` | Oportunidades e historial/tareas |
| `contactforms`, `formsubmissions` | Formularios públicos y sus envíos |
| `campaigns` | Campañas de email y WhatsApp |
| `recoveryplans` | Planes de recuperación de clientes |
| `watemplates` | Plantillas de WhatsApp Cloud API |
| `aiagents`, `knowledgedocs`, `knowledgechunks`, `agentfiles` | Agentes de IA y su base de conocimiento |
| `conversations`, `messages` | Bandeja omnicanal |
| `suppressionentries` | Lista de no contactar |
| `whatsappaccounts`, `instagramaccounts`, `messengeraccounts` | Cuentas de canal |
| `events`, `eventregistrations`, `eventtemplates`, `externalimpulsadores` | Eventos, inscripciones, plantillas e impulsadores externos |
| `visits` | Visitas geolocalizadas de impulsadores |
| `pushsubscriptions`, `devicetokens` | Web Push y push nativo |
| `menucategories`, `menuitems`, `orders`, `reservations` | Hostelería (en reserva) |

---

## 28. Documentación relacionada

| Documento | Contenido |
| --- | --- |
| `docs/kitui.md` | Design system completo: variables, clases y patrones |
| `docs/permissions.md` | Permisos por rol, en detalle |
| `docs/usuarios.md` | Usuarios sembrados por entorno |
| `docs/modelos-ia.md` | Modelos de IA por proveedor y criterio de elección |
| `docs/no-contactar.md` | Diseño de la lista de supresión |
| `docs/notificaciones-push.md` | Puesta en marcha de Web Push (VAPID) |
| `docs/android-app.md` | App Android con Capacitor |
| `docs/whatsapp-setup.md`, `docs/whatsapp-cloud-api-oauth-setup.md` | Alta de WhatsApp (WAHA y Cloud API) |
| `docs/instagram-dm-setup.md`, `docs/instagram-dm-campaigns.md` | Instagram Direct |
| `docs/messenger-setup.md` | Facebook Messenger |
| `docs/campana-recuperacion.md`, `docs/campana-recuperacion-precio-congelado.md` | Campañas de recuperación |
| `docs/analisis-agente-ia.md`, `docs/analisis-conversaciones-ia.md` | Análisis de agentes y conversaciones |
| `docs/PROMPT_AGENTE_RESERVAS.md`, `_V2`, `docs/BASE_CONOCIMIENTO_RESERVAS.md` | Prompts y base de conocimiento de ejemplo |
| `docs/plataforma_hospitalidad_historias_usuario.md` | Historias de usuario del producto |
| `docs/deploy.md` | Despliegue, DNS y CI/CD |
| `docs/PLAN_OPTIMIZACION.md` | Plan de optimización |
