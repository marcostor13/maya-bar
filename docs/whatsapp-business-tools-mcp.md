# MCP de herramientas de WhatsApp Business (Meta)

Fuente: <https://developers.facebook.com/documentation/mcp/whatsapp-business-tools-mcp>
(actualizada por Meta el 29 oct 2026, **beta**: herramientas e interfaz pueden cambiar).
Revisado el 2026-11-06.

## Qué es

Servidor MCP oficial de Meta para que un agente (Claude Code) administre y depure
la integración de WhatsApp Cloud API **actuando como el usuario que inicia sesión**,
sobre sus propios negocios y apps. Sirve para operar y diagnosticar; **no** sustituye
al backend de Maya, que actúa en nombre de cada cliente con su propio token.

| Atributo | Valor |
|---|---|
| Endpoint | `https://mcp.facebook.com/whatsapp_business_tools` |
| Transporte | HTTP transmitible |
| Autenticación | OAuth con la cuenta de desarrollador de Meta (registro automático, sin client id ni redirect URI) |
| Scopes | `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging` |
| Límites | por usuario y por herramienta; ante error de límite, esperar y reintentar |

## Configuración en este proyecto

Está declarado en `.mcp.json` (raíz) con el nombre `whatsapp-business-tools`.
Primera vez:

1. Abrir Claude Code en la raíz del repo y aprobar el servidor del proyecto.
2. `/mcp` → `whatsapp-business-tools` → autenticar (abre el login de Meta). El
   login y el consentimiento los hace **el usuario**, nunca el agente.
3. Verificar: pedir `whatsapp_biz_businesses`. Debe listar los portfolios
   (Maya: `1181735023516920`; Farma: `583731638951022`).

El despliegue es gradual: puede conectar y aun así no estar disponible en la cuenta.
Revocar acceso: Facebook > Configuración > Tu actividad > Integraciones comerciales.

Requisitos para la mayoría de herramientas:
- rol de administrador (MANAGE) en el negocio;
- ser administrador de una app con WhatsApp conectada a ese negocio (Maya IA `985986576689480`);
- condiciones de Cloud API aceptadas en ese negocio (si no, se bloquean envío y registro de números).

## Herramientas (prefijo `whatsapp_biz_`)

| Grupo | Herramienta | Uso | Equivalente en Maya |
|---|---|---|---|
| Descubrimiento | `businesses` | negocios con consentimiento (empezar aquí) | — |
| | `accounts` | WABAs de un negocio | `whatsapp-accounts` (`waBusinessAccountId`) |
| | `phone_numbers` | números, estado y registro | `WhatsAppOAuthService.fetchPhoneNumberInfo` / `findPhoneNumberId` |
| Números | `add_phone_number`, `send_verification_code`, `verify_phone_number`, `register_phone_number` | alta de un número | Embedded Signup + `WhatsAppOAuthService.registerPhoneNumber` |
| Plantillas | `list_templates`, `get_template`, `create_template`, `update_template`, `delete_template` | CRUD de plantillas | `backend/src/whatsapp-templates/` |
| Mensajes | `send_message` | texto libre (ventana de 24 h) o plantilla aprobada | `WhatsAppService.sendMessage` / `sendCloudApiTemplate` |
| Webhooks | `configure_webhooks` | callback + verify token de la app, campos | webhook de la app: `/wa/webhook/cloud/:id` |
| | `subscribe_webhook` | suscribir una WABA a la app | `WhatsAppService.registerCloudApiWebhook` (`override_callback_uri` por WABA) |
| Cuenta | `configure_payments` | método de pago (mensajes facturables) | pendiente tras la App Review |
| | `verify_business` | estado e inicio de verificación del negocio | — |
| | `system_user_token` | enlace a Usuarios del sistema para generar token | tokens manuales (p. ej. Farma) |

## Usos previstos en Maya

- **Diagnóstico de un cliente que no recibe/envía**: `phone_numbers` (estado,
  calidad, registro) y `subscribe_webhook` para ver si la WABA está suscrita.
- **Plantillas**: revisar el estado de aprobación real frente a lo que guarda
  `whatsapp-templates`; probar categorías/idiomas antes de implementarlos.
- **Pago y verificación** del portfolio de Maya después de la App Review
  (`configure_payments`, `verify_business`).
- **Prototipar integraciones** nuevas: probar la llamada con el MCP y luego
  portarla a `WhatsAppService` con el token del cliente.

## Reglas para el agente

- `send_message` envía mensajes reales y facturables: confirmar destino y texto con
  el usuario antes de cada envío.
- `configure_webhooks` cambia la callback **de toda la app** (afecta a todos los
  clientes de Maya IA): no usarlo sobre Maya IA sin confirmación. Para una WABA
  concreta, Maya usa `override_callback_uri`.
- `delete_template`, registro de números y pagos: confirmar siempre antes.
- No pegar tokens del MCP en el código ni en `.env`: el backend usa los tokens de
  cada cuenta (`waAccessToken`).
