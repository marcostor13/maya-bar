# Campañas por Instagram DM — Plan de Implementación

## 1. Cómo funciona la API de Mensajería de Instagram (Meta)

Instagram DM **no funciona como email ni como WhatsApp Cloud API**. Hay restricciones críticas que determinan toda la arquitectura.

### 1.1 Restricción fundamental: el PSID

Para enviar un DM a alguien, necesitás su **PSID** (Page-Scoped ID), que es el ID del usuario en el contexto de tu cuenta de Instagram Business. Este ID:

- **Solo se obtiene cuando el usuario te manda un mensaje primero**
- No se puede derivar de un username de Instagram ni de ningún otro dato
- Es único por cuenta de negocio (no es el ID público de Instagram)

**Consecuencia directa**: no podés hacer campañas DM a toda tu base de clientes como en email. Solo podés contactar a clientes que hayan interactuado previamente con tu cuenta de Instagram Business.

### 1.2 Ventanas de mensajería permitidas

| Ventana | Condición | Tipo de mensaje |
|---------|-----------|-----------------|
| **24 horas** | El usuario te escribió en las últimas 24h | Cualquier mensaje (marketing, info, etc.) |
| **7 días** | Tag `HUMAN_AGENT` | Solo respuestas de agente humano |
| **Post-24h con Message Tags** | Tags aprobados | Solo mensajes específicos (ver abajo) |
| **One-Time Notification (OTN)** | El usuario se suscribió a notificación | Un solo mensaje de marketing posterior |

### 1.3 Message Tags permitidos (fuera de la ventana de 24h)

Solo para casos de uso específicos:

- `CONFIRMED_EVENT_UPDATE` → confirmación/cambio de reserva o evento
- `POST_PURCHASE_UPDATE` → estado de pedido/compra
- `ACCOUNT_UPDATE` → cambios en la cuenta del usuario

> Para una plataforma de restaurantes, los casos más realistas son enviar confirmaciones de reserva (`CONFIRMED_EVENT_UPDATE`) o seguimiento post-visita (`POST_PURCHASE_UPDATE`) a clientes que te hayan escrito en Instagram.

---

## 2. Lo que se puede implementar realistamente

### ✅ Casos de uso válidos

| Caso | Mecanismo | Relevancia para BAR |
|------|-----------|---------------------|
| Responder consultas y convertir en reserva | 24h window | Alta — bot o respuesta manual |
| Confirmar reserva hecha desde Instagram | `CONFIRMED_EVENT_UPDATE` | Alta |
| Seguimiento post-visita | `POST_PURCHASE_UPDATE` | Media |
| Notificación de evento a suscriptores OTN | OTN | Media |

### ❌ Lo que NO es posible

- DMs masivos de marketing a toda tu base de clientes
- Iniciar conversación con alguien que nunca te escribió
- Enviar promos genéricas fuera de la ventana de 24h (excepto OTN)

---

## 3. Arquitectura de implementación

```
┌─────────────────────────────────────────────────────────────────┐
│ Instagram Business Account ──► Meta App (Graph API)             │
│                                                                  │
│  Usuario escribe DM ──► Webhook ──► Backend BAR                 │
│                                       │                         │
│                                       ▼                         │
│                              customer.instagramPsid = "xxxxx"   │
│                                       │                         │
│                              Campaign (type: 'instagram')       │
│                              Solo clientes con PSID             │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1 Cambios en backend

#### `customer.schema.ts`
Agregar campo:
```typescript
@Prop() instagramPsid?: string;   // Page-Scoped User ID
@Prop() instagramUsername?: string; // Solo referencia visual
```

#### `campaign.schema.ts`
```typescript
type: 'email' | 'whatsapp' | 'instagram'
```

#### `tenant-config.schema.ts`
```typescript
@Prop() igPageId?: string;           // Facebook Page ID vinculada a Instagram
@Prop() igAccessToken?: string;      // Page Access Token (long-lived)
@Prop() igVerifyToken?: string;      // Token para verificar webhook
```

#### Nuevo `instagram.service.ts`
- `sendDM(psid, text, tag?)` → `POST /{page-id}/messages`
- `verifyWebhook(query)` → verificación inicial del webhook
- `handleWebhook(body)` → guardar PSID cuando usuario escribe

#### Nuevo webhook endpoint
```
POST /instagram/webhook   → recibe mensajes entrantes, guarda PSID
GET  /instagram/webhook   → verificación de Meta
```

#### `campaigns.service.ts`
- Filtrar clientes con `instagramPsid` al enviar por Instagram
- Elegir tag según tipo de campaña

### 3.2 Cambios en frontend

- **Customers**: mostrar/editar `instagramUsername` e indicador de PSID disponible
- **Campaigns**: nuevo canal "Instagram DM" con selector de message tag
- **Settings**: sección Instagram con Page ID, Access Token, estado del webhook

---

## 4. Lo que tenés que hacer vos (en Meta)

### Paso 1 — Cuenta de Instagram Business
1. Tener una **cuenta de Instagram Business** (no Personal ni Creator)
2. Conectarla a una **Facebook Page** (Business Manager)

### Paso 2 — Crear Meta App
1. Ir a [developers.facebook.com](https://developers.facebook.com) → Crear App → Tipo: **Business**
2. Agregar el producto **"Instagram"** → "Instagram Graph API"
3. Agregar el producto **"Messenger"** → para webhooks de mensajes (sí, Messenger maneja los DMs de Instagram también)

### Paso 3 — Permisos necesarios
Solicitar en la App Review de Meta:
- `instagram_manage_messages` ← **obligatorio**, requiere revisión de Meta
- `pages_messaging` ← para enviar mensajes
- `pages_show_list` ← para listar páginas

> ⚠️ La revisión de Meta para `instagram_manage_messages` puede tardar **1-2 semanas**. Necesitás explicar el caso de uso.

### Paso 4 — Generar Page Access Token
1. En Graph API Explorer, conectar tu Facebook Page vinculada a Instagram
2. Generar token con los permisos anteriores
3. Convertirlo a **Long-Lived Token** (válido 60 días o permanente con System User)

### Paso 5 — Obtener Page ID
En Graph Explorer: `GET /me?fields=id,name` con el token de la página.

### Paso 6 — Configurar Webhook
Una vez el backend esté deployado con el endpoint `/instagram/webhook`:
- URL: `https://tu-dominio.com/instagram/webhook`
- Verify Token: el que configures en Settings de BAR
- Suscribirse a: `messages`, `messaging_postbacks`

> En desarrollo, necesitás un túnel público (ngrok, Cloudflare Tunnel) para que Meta pueda alcanzar el webhook.

---

## 5. Orden de implementación sugerido

```
Semana 1:
[Vos]  → Crear Meta App, solicitar instagram_manage_messages
[Dev]  → webhook endpoint + guardado de PSID en customers
[Dev]  → instagram.service.ts (sendDM)
[Dev]  → campo instagramPsid en customer schema

Semana 2 (cuando Meta apruebe permisos):
[Vos]  → Configurar webhook en Meta con URL real (ngrok o producción)
[Vos]  → Escribir desde tu cuenta personal al negocio para probar PSID
[Dev]  → Canal Instagram en campaigns (UI + backend send)
[Dev]  → Settings Instagram section

Semana 3:
[Dev]  → OTN support (opt-in button + send notification)
[Dev]  → Tag selector en campaigns (CONFIRMED_EVENT_UPDATE, etc.)
```

---

## 6. Limitación crítica a tener en cuenta

La **base de clientes del CRM de BAR viene principalmente de reservas y eventos**, donde los datos son email/teléfono. Esos clientes **no tienen PSID** hasta que interactúen con la cuenta de Instagram.

Para crecer la base con PSID:
- Poner un botón "Escríbenos por Instagram" en confirmaciones de reserva
- Anuncio en Instagram Stories con respuesta rápida
- QR en el local que abre chat de Instagram DM

---

## 7. Alternativa más simple: Envío manual asistido

Si la aprobación de Meta demora mucho, se puede implementar una versión simplificada:

- Al crear campaña tipo Instagram, generar el texto personalizado para cada cliente
- Mostrar lista de clientes con su `@instagramUsername` y el mensaje a copiar
- El negocio lo envía manualmente desde el móvil

Esto no requiere API ni aprobación de Meta, y sirve como puente hasta tener la integración completa.
