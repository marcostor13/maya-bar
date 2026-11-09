# Llamadas de WhatsApp

Maya recibe y hace llamadas de voz de WhatsApp Business desde el navegador (y
la app Android). El audio va directo entre el navegador y Meta; el servidor de
Maya solo coordina la llamada.

Qué hay en la plataforma:

- **Aviso de llamada entrante** en cualquier pantalla, para todo el equipo con
  el módulo *Llamadas*. El primero que acepta se la queda; a los demás se les
  quita el aviso. Con la plataforma cerrada llega una notificación push.
- **Panel de llamada**: cronómetro, silenciar y colgar.
- **Historial** en *Clientes › Llamadas* (`/llamadas`), con filtros por fechas,
  estado, tipo, quién atendió y cuenta. Desde cada fila: devolver la llamada,
  abrir la ficha o el chat.
- **Botón "Llamar"** en el historial, en la ficha del contacto y en el chat de
  WhatsApp. Si el cliente no ha dado permiso, desde ahí se le pide.
- **Registro automático**: cada llamada terminada deja una actividad en la ficha
  del contacto y una nota en su chat de WhatsApp.
- **Panel de inicio**: llamadas, perdidas y duración media del periodo.
- **Configuración por cuenta** (*Configuración › WhatsApp*, icono de teléfono):
  activar llamadas, botón de llamada, devolución de llamada, horario semanal,
  tiempo que suena antes de darla por perdida y mensaje automático para las
  perdidas.

## Lo que tienes que hacer tú (una vez)

### 1. Requisitos de Meta

- El número debe estar en WhatsApp Cloud API (no en la app de WhatsApp
  Business del móvil).
- Límite de mensajería de **2 000 conversaciones/día o más** (lo pide Meta
  para habilitar llamadas).
- Para **llamar** a clientes (salientes): un método de pago en la cuenta de
  WhatsApp Business. Recibir llamadas no tiene coste.

### 2. Suscribir el webhook al campo `calls`

En [developers.facebook.com](https://developers.facebook.com) → tu app →
**WhatsApp › Configuración › Webhook** → *Administrar* → marca **`calls`**
(además de `messages`, que ya está). La URL del webhook no cambia.

### 3. Secreto de la app (obligatorio para llamadas)

Maya comprueba la firma de cada webhook de Meta (`X-Hub-Signature-256`). Sin el
secreto, los mensajes siguen funcionando, pero **las llamadas se descartan**.

- **Cuentas conectadas con "Conectar con Facebook"** (URL `/wa/webhook/cloud`):
  la variable `FACEBOOK_APP_SECRET` del backend (en Coolify). Es el *App
  Secret* de *Configuración de la app › Básica*.
- **Cuentas añadidas a mano con la app propia de la empresa** (URL
  `/wa/webhook/cloud/<id>`): en *Configuración › WhatsApp › editar la cuenta*,
  campo **App Secret**. Se guarda en la base y la API nunca lo
  devuelve; déjalo vacío para no cambiarlo.

### 4. Activar las llamadas en el número

En Maya: *Configuración › WhatsApp* → icono de teléfono de la cuenta →
**Llamadas activadas** → *Guardar*. Si Meta rechaza el cambio, Maya muestra su
motivo (p. ej. límite de mensajería insuficiente).

### 5. Roles

Los roles por defecto (administrador, gerente, marketing, impulsador) ya
incluyen *Llamadas*. **Si personalizaste los roles de tu empresa**, añade el
módulo en *Usuarios › Roles*. Los cambios de rol se aplican al volver a entrar
(el aviso de llamadas se asigna al conectar).

### 6. Variables opcionales del backend

| Variable | Para qué | Por defecto |
|---|---|---|
| `META_CALLING_GRAPH_VERSION` | Versión de Graph de la Calling API | `v24.0` |
| `CALLS_ICE_SERVERS` | Servidores STUN/TURN en JSON, si la red de la oficina bloquea el audio | STUN público de Google |

## Cómo funciona el permiso para llamar

WhatsApp solo deja llamar a un cliente que lo autorizó:

- El botón **Pedir permiso** le envía una solicitud por WhatsApp.
- Si acepta, el permiso dura **7 días** (o es permanente si así lo elige).
- WhatsApp limita la solicitud a **1 por día y 2 por semana** por cliente.
- El diálogo "Llamar" muestra el estado: sin permiso, pendiente, concedido
  hasta tal fecha, rechazado o vencido.

## Comportamiento

- **Rechazar** cuelga la llamada para todos (como un teléfono).
- **Sin respuesta**: suena el tiempo configurado (30 s por defecto) y queda
  como *Perdida*. Si activaste el mensaje automático, se le envía al cliente.
- **Fuera de horario**: WhatsApp no deja llamar, así que esas llamadas no
  aparecen en Maya.
- **Contactos bloqueados**: la llamada se rechaza sola y queda como
  *Bloqueada*, sin aviso al equipo.
- **Micrófono**: si el navegador o el móvil no dan permiso, Maya explica cómo
  darlo y no acepta la llamada (sigue sonando para el resto del equipo).
  En la app Android: *Ajustes › Apps › Maya › Permisos › Micrófono*.

## Prueba manual (tras activar)

1. Con Maya abierto en el navegador, llama al número de empresa desde un
   móvil con WhatsApp: debe aparecer el aviso con el nombre del contacto.
2. Pulsa *Aceptar*, permite el micrófono y comprueba que **se oyen los dos**.
3. Cuelga desde el móvil: el panel se cierra y la llamada aparece como
   *Completada* en `/llamadas`, con nota en el chat y actividad en la ficha.
4. Llama otra vez y no contestes: tras el tiempo de espera queda *Perdida*.
5. Cierra Maya (o bloquea el móvil con la app instalada) y llama: debe llegar
   la notificación push.
6. Desde la ficha del contacto pulsa *Llamar*: si no hay permiso, pídelo,
   acéptalo en el móvil y vuelve a pulsar *Llamar*.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| No llega ningún aviso | Webhook sin el campo `calls`, o falta el App Secret (el log del backend dice "Evento de llamada sin firma verificada"). |
| Llega el aviso pero no hay audio | Red que bloquea UDP: configura un TURN en `CALLS_ICE_SERVERS`. |
| "No se pudo activar" al guardar | Meta exige el límite de 2 000 o el número no está en Cloud API; el mensaje de Meta lo indica. |
| "Llamar" siempre deshabilitado | El cliente no ha dado permiso, o ya se pidió el máximo de la semana. |
