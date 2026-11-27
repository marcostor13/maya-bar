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
| 1.1 | Registro como proveedor de tecnología — **hecho** (2026-11-24). | — |
| 1.2 | Método de pago de WhatsApp — **hecho**: VISA en la cuenta Maya IA `447412891798170`. La otra cuenta propia, Maya IA `1337226928401858`, sigue sin tarjeta. | business.facebook.com > Cuentas de WhatsApp |
| 1.3 | **Pasar la app a modo Activo** — Meta no lo permite hasta que aprueben la solicitud en curso ("primero debe enviarse y aprobarse la solicitud de revisión de la app"). Cuando llegue la aprobación, activar el interruptor "App Mode". Mientras tanto solo llegan mensajes de Messenger e Instagram de quien tenga un rol en la app. | Interruptor "App Mode" arriba del panel |
| 1.4 | Coolify: `FACEBOOK_LOGIN_CONFIG_ID` = `1075415515523668` — **comprobado**. | — |
| 1.5 | Videos de Messenger e Instagram subidos y solicitud enviada (2026-11-24). **Esperar el resultado** y responder si Meta pide algo. | Revisión de la app > Solicitudes |
| 1.6 | Cuenta de prueba del revisor — **hecha**. No la borres mientras dure la revisión. | mayacrm.site |
| 1.7 | **Lead Ads (HU60):** cuando quieras pedir `leads_retrieval` y `pages_read_engagement`, primero pon `META_LEAD_ADS_ENABLED=true` en el backend. Hasta entonces Maya no los pide al conectar Páginas, para que el video de la revisión muestre solo los 3 permisos solicitados. | Coolify > backend |

## 2. Variables nuevas en Coolify (backend)

| Variable | Para qué | Valor |
|---|---|---|
| `OPENAI_API_KEY` | Agente de voz (HU73), con OpenAI Realtime. **Ya está puesta** (comprobado 2026-11-24). | — |
| `VOICE_REALTIME_MODEL` | Opcional; si falta se usa `gpt-realtime`. No hace falta ponerla. | — |
| `META_LEAD_ADS_ENABLED` | Ver 1.7 | `false` hasta que Meta apruebe |
| `SALES_NOTIFY_EMAIL` | Aviso de cada venta (HU75). Opcional: si falta va a `admin@ignia.site`. | — |
| `INVOICING_AUTO` | Emisión automática con Nubefact. Déjala sin poner (o `false`): facturas a mano desde Facturación > Comprobantes > Por facturar. | `false` |
| `NUBEFACT_URL`, `NUBEFACT_TOKEN` | Solo cuando quieras facturación automática. Ver `docs/facturacion-nubefact.md`. | pendiente |

## 3. Pruebas reales que solo tú puedes hacer

| Historia | Qué probar |
|---|---|
| HU69, chat web | Pegar el código del widget (Configuración > Chat web) en un sitio real y conversar desde otro dispositivo. |
| HU70, puntaje de leads | Recibir mensajes reales y comprobar que el puntaje y el motivo tienen sentido (usa créditos de IA). |
| HU72, agencia | Activar el Plan Agencia en una empresa (Empresas > detalle). Para el dominio del panel: CNAME de la agencia hacia la app y el dominio añadido en Coolify (TLS). |
| HU73, agente de voz | Activarlo en los ajustes de llamadas de un número, llamar fuera de horario y comprobar que la cita aparece en el calendario y cuánto tarda en responder. No se probó contra OpenAI real. |
| Mercado Pago | Compra real de un plan mensual con tu tarjeta (`docs/activar-compras-mercadopago.md` §7): llega el correo "Nueva venta" a admin@ignia.site y el pago queda en "Por facturar". |
| Search Console y Bing | Verificar `mayacrm.site` en Google Search Console y Bing Webmaster Tools y enviar `https://mayacrm.site/sitemap.xml` (`docs/plan-seo-geo.md`). |
| Precios de la competencia | Cada trimestre, revisar las páginas oficiales de HubSpot, Kommo, Leadsales y Wati y actualizar `frontend/src/app/pages/content/data/comparativas.ts` (cifras y fecha de revisión). Próxima: febrero de 2027. |
| Caso de cliente para SEO | Conseguir un cliente con números reales y su permiso por escrito para publicar un caso (`docs/plan-seo-geo.md`, fase 3). |
| Perfiles de la marca | LinkedIn, YouTube, Product Hunt, G2, Capterra y Google Business Profile con los mismos datos; luego pasar las URL para el `sameAs` del JSON-LD. |
| HSTS | Activar `Strict-Transport-Security` en el proxy de Coolify. |
| Firma del APK | Crear `frontend/android/key.properties` (ver `key.properties.example`) apuntando al keystore y con sus contraseñas; después `./gradlew assembleRelease` genera el APK firmado. |
| Webhook de Mercado Pago | En la app de Mercado Pago (Tus integraciones → Webhooks, modo productivo) marcar los eventos **Pagos**, **Planes y suscripciones** (`subscription_preapproval` y `subscription_authorized_payment`) con la URL `https://api.mayacrm.site/billing/webhooks/mercadopago`. Hasta hoy no ha llegado ningún aviso; mientras tanto la conciliación cada 10 min (HU78) activa las compras. |
| Yape | Pago real de un plan trimestral o una recarga eligiendo Yape en Mercado Pago (`docs/yape-mercadopago.md`). |
| HU6, llamadas | Sigue pendiente la llamada real con un número que tenga la Calling API activa. |
| Meta Ads: CAPI (HU84) | Ya no hay registro gratis (HU87): `CompleteRegistration` deja de dispararse. Quitar `META_TEST_EVENT_CODE` del backend en Coolify y redesplegar; el evento a medir pasa a ser la compra. |
| Meta Ads: página, WhatsApp e Instagram | Hecho el 2026-11-26: la página Maya CRM pasó al portafolio "Marcos Torres Alarcón" (1035475214106769), donde está la cuenta de WhatsApp del 991 172 822, y se compartió con "Maya IA" con acceso total para los anuncios. El 991 172 822 es el número principal de la página e @mayacrmperu volvió a vincularse. Si "Maya CRM – PEN" no ofrece la página o el Instagram al crear anuncios, asignarlos en Maya IA > Cuentas publicitarias. |
| Meta Ads: Instagram | Falta poner el enlace de la biografía desde la app del celular (`docs/meta-ads-contenido.md`). |
| HU85, IA de la plataforma | Tras desplegar: en `/admin/ai` pegar la API key, elegir el modelo, "Probar", activar y guardar; luego probar un agente de una empresa sin key propia (`docs/ia-de-la-plataforma.md`). |
| HU86, cuenta demo | Tras desplegar: Empresas > "Crear / restablecer demo" (carga los datos de HU89) y abrir https://mayacrm.site/demo en una ventana de incógnito: entra sin contraseña (HU90). Es de solo lectura (HU88); restablecerla solo si quieres fechas frescas, el prompt de ventas no cambia. Desde la demo no se puede enviar por WhatsApp (no tiene token). |
| HU87, sin prueba gratis | La web usa por defecto el 51991172822 (agente de ventas). Si Coolify define `WHATSAPP_NUMBER` para el frontend con otro número, cambiarlo o borrarlo. Ya no hay registro gratis: las cuentas nacen al pagar en /checkout. |
| Meta Ads: campañas | Los borradores A y B se borraron el 2026-11-26 (había prueba gratis). Plan nuevo con videos en `docs/meta-ads-guiones.md`: grabar y pasarme los videos; los subo como borradores y tú publicas. |

## 4. Fuera de lo hecho

- **HU71, app de iOS**: no se implementó (se dejó fuera a propósito).
- **HU72, fase 2**: cobro de la agencia a sus clientes y precio de sub-cuentas extra.
