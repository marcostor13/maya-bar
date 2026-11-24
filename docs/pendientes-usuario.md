# Pendientes de tu lado (al 2026-11-24)

Lo que el código no puede hacer solo: consolas externas, términos legales,
credenciales y pruebas con cuentas, números y dinero reales.

## 1. Meta: app "Maya IA" (`985986576689480`)

**Estado de la revisión:** la segunda solicitud (5 permisos rechazados, con videos
nuevos y cuenta del revisor) se envió el 2026-11-24 y está **en revisión** (Meta
tarda hasta 20 días). Resultado de la primera solicitud:

- Aprobados con acceso avanzado: `whatsapp_business_management` y
  `whatsapp_business_messaging`.
- Rechazados: `instagram_business_basic`, `instagram_business_manage_messages`,
  `pages_show_list`, `pages_manage_metadata` y `pages_messaging`. Todos por el
  video: el caso de uso está permitido.

| # | Qué | Dónde |
|---|---|---|
| 1.1 | **Registrarte como proveedor de tecnología.** Los dos pasos ya están en verde. Falta pulsar "Iniciar registro" (Independent Tech Provider), que **acepta las Condiciones para proveedores de tecnología**: eso lo aceptas tú. | WhatsApp > Inicio rápido > "Continuar registro" |
| 1.2 | **Añadir un método de pago** a la cuenta de WhatsApp. Sin él solo se responden conversaciones que inicia el cliente; no se pueden enviar plantillas. | WhatsApp > Inicio rápido > "Agregar método de pago" |
| 1.3 | **Pasar la app a modo Activo.** Hoy está en Desarrollo: los clientes de otras empresas no pueden usar el registro integrado de WhatsApp ni llegan sus mensajes de Messenger o Instagram. Con WhatsApp aprobado ya puedes activarla; los permisos rechazados seguirán con acceso estándar hasta que se aprueben. | Interruptor "App Mode" arriba del panel |
| 1.4 | Coolify: `FACEBOOK_LOGIN_CONFIG_ID` = `1075415515523668` — **comprobado**. | — |
| 1.5 | Videos de Messenger e Instagram subidos y solicitud enviada (2026-11-24). **Esperar el resultado** y responder si Meta pide algo. | Revisión de la app > Solicitudes |
| 1.6 | Cuenta de prueba del revisor — **hecha**. No la borres mientras dure la revisión. | mayacrm.site |
| 1.7 | **Lead Ads (HU60):** cuando quieras pedir `leads_retrieval` y `pages_read_engagement`, primero pon `META_LEAD_ADS_ENABLED=true` en el backend. Hasta entonces Maya no los pide al conectar Páginas, para que el video de la revisión muestre solo los 3 permisos solicitados. | Coolify > backend |

## 2. Variables nuevas en Coolify (backend)

| Variable | Para qué | Valor |
|---|---|---|
| `OPENAI_API_KEY` | Agente de voz (HU73). Ya existía si usas OpenAI. | tu clave |
| `VOICE_REALTIME_MODEL` | Opcional | `gpt-realtime` |
| `META_LEAD_ADS_ENABLED` | Ver 1.7 | `false` hasta que Meta apruebe |

## 3. Pruebas reales que solo tú puedes hacer

| Historia | Qué probar |
|---|---|
| HU69, chat web | Pegar el código del widget (Configuración > Chat web) en un sitio real y conversar desde otro dispositivo. |
| HU70, puntaje de leads | Recibir mensajes reales y comprobar que el puntaje y el motivo tienen sentido (usa créditos de IA). |
| HU72, agencia | Activar el Plan Agencia en una empresa (Empresas > detalle). Para el dominio del panel: CNAME de la agencia hacia la app y el dominio añadido en Coolify (TLS). |
| HU73, agente de voz | Activarlo en los ajustes de llamadas de un número, llamar fuera de horario y comprobar que la cita aparece en el calendario y cuánto tarda en responder. No se probó contra OpenAI real. |
| HU6, llamadas | Sigue pendiente la llamada real con un número que tenga la Calling API activa. |

## 4. Fuera de lo hecho

- **HU71, app de iOS**: no se implementó (se dejó fuera a propósito).
- **HU72, fase 2**: cobro de la agencia a sus clientes y precio de sub-cuentas extra.
