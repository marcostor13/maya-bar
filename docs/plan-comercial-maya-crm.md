# Plan comercial Maya CRM — precios, implementación y roadmap de rentabilidad

_Fecha: 2026-09-28. Fuentes de mercado y competencia al final. Cifras con (?) no están confirmadas en fuente oficial._

---

## 1. Resumen ejecutivo

- **Mercado:** el CRM en LATAM crece ~14,5 % anual (a ~US$10,9 B en 2030). WhatsApp llega al 82–99 % de la población según el país y el 70 %+ de los usuarios habla con empresas por ese canal. Más del 70 % de las pymes tiene baja madurez digital, así que **gana quien vende producto + puesta en marcha asistida**.
- **Posición de Maya:** a nivel funcional ya está **por encima de Leadsales/Kommo en IA** (agentes con RAG y multimodelo, recuperación de clientes, prospección con IA). También cubre más canales (WhatsApp QR + Cloud API, Instagram, Messenger, email IMAP/Gmail/Outlook), tiene reparto de oportunidades con bolsa, app Android y eventos con registro.
- **Problema:** hoy **no puede cobrar**. No hay pasarela de pago, suscripciones, límites por plan ni medición de consumo. El campo `plan` del tenant existe pero no se aplica.
- **Propuesta de precios:** 19/59/129 deja dinero sobre la mesa y no distingue a quién le sirve cada plan. Esta es la escala recomendada:

| | **Inicia** | **Crece** ⭐ | **Escala** | **Empresa** |
|---|---|---|---|---|
| Mensual | **US$29** | **US$79** | **US$169** | desde **US$399** |
| Anual (2 meses gratis) | US$290/año (≈24/mes) | US$790/año (≈66/mes) | US$1.690/año (≈141/mes) | a medida |
| Usuarios incluidos | 2 | 5 | 12 | a medida |

- **Implementación** (pago único): Autoservicio US$0 · Puesta en marcha **US$149** · Implementación Pro **US$449** · Empresa **desde US$1.200**. La puesta en marcha es **gratis con cualquier plan anual**.
- **Los mensajes de WhatsApp (Meta) los paga el cliente directo a Meta, sin recargo.** Es un argumento de venta frente a Leadsales, que obliga a comprar créditos de mensajes, y protege el margen.

---

## 2. Análisis de mercado

| Dato | Valor | Implicación para Maya |
|---|---|---|
| CRM LATAM | ~US$10,9 B a 2030, CAGR 14,5 % | Mercado grande y en crecimiento |
| Comercio conversacional LATAM | ~US$18 B, +35 %/año; 72 % por WhatsApp, 15 % IG DM, 8 % Messenger (?) | Maya ya cubre los tres canales |
| Penetración WhatsApp | BR 93–99 %, MX 93 %, CO 92–94 %, AR/CL 90–94 %, PE 82 % | WhatsApp-first es lo correcto |
| Microempresas usando WhatsApp Business | 12 % → 28 % (2023–2025) | Hay un segmento de entrada barato (plan Inicia) |
| Madurez digital pyme | >70 % baja | Cobrar la implementación: el cliente no se conecta solo a Cloud API |
| Gasto típico WhatsApp + IA | US$50–150/mes de plataforma + consumo Meta | Crece (79) y Escala (169) están dentro del rango |

**Clientes ideales (por orden de fit con lo que ya existe):**

1. **Inmobiliarias y automotriz:** bolsa de oportunidades, reparto, anuncios click-to-WhatsApp y seguimiento.
2. **Academias y educación:** formularios de admisión, eventos y webinars, campañas por convocatoria, agente IA con requisitos.
3. **Clínicas y servicios:** agente IA 24/7 y recuperación de pacientes inactivos. Aquí falta la agenda de citas.
4. **Agencias:** multi-cliente, prospección con IA. Aquí falta white-label.
5. **Eventos y productoras:** eventos, promotores, check-in.

---

## 3. Inventario funcional (lo que Maya hace hoy)

| Área | Estado | Nota comercial |
|---|---|---|
| Contactos, etiquetas, campos, importación Excel/CSV/Mongo, export CSV | Completo | Base de todos los planes |
| Listas estáticas y dinámicas | Completo | Las reglas dinámicas conservan campos de hostelería: conviene generalizarlas |
| Formularios públicos con autorespuesta WA/email | Completo | |
| Campañas WhatsApp (QR con límite diario / Cloud API con plantillas) y email (Resend) | Completo | El estimador tiene fijo US$0,0625 por mensaje: debería usar la tarifa por país |
| Conectores WhatsApp: WAHA (QR) + Cloud API con Embedded Signup | Completo | El QR es la opción barata del plan Inicia |
| Plantillas Meta | Completo | |
| Agentes IA: RAG, multimodelo, voz, imagen, video, PDF escaneado, handoff | Completo | **Diferenciador principal** |
| Bandeja unificada WA + IG + Messenger + email | Completo | |
| Buzones email: Gmail, Outlook, IMAP, POP3 | Completo | |
| Asistente de recuperación de clientes | Completo, sin prueba E2E | **Feature premium** (plan Escala). Consume mucho LLM |
| Pipeline de 7 etapas fijas + bolsa, tomar, soltar, derivar, recordatorios | Completo | Las etapas no se pueden personalizar |
| Prospección con IA (Places, Serper, Hunter, PageSpeed) | Completo | Feature premium para agencias y B2B |
| Dashboard con KPIs comparados, canal, heatmap, tiempos de respuesta | Completo | |
| Eventos con página pública, check-in, IA | Completo | |
| Promotores y visitas con GPS | Completo | |
| Usuarios, roles y matriz de permisos, datos por propietario | Completo | |
| Multi-sede | Parcial | |
| Push web + FCM, app Android | Completo | Falta iOS |
| **Billing, planes, cuotas, medición** | **No existe** | **Bloqueante para cobrar** |

---

## 4. Competencia

| Competidor | Precio (USD/mes) | Métrica | Setup | Meta | Dónde le gana Maya | Dónde pierde Maya |
|---|---|---|---|---|---|---|
| **Kommo** | 25 / 35 / 45 por usuario (mín. 6 meses) | Usuario | Partners US$500–3.000 | Aparte | Precio por equipo (5 usuarios en Kommo = US$175), recuperación con IA, email IMAP | Salesbot (flujos), madurez, marketplace |
| **Leadsales** | 97 (3 us., sin API) / 133 / 247 | Plan + créditos | 0 (prueba de US$7) | Créditos obligatorios | Mitad de precio, Cloud API desde el plan medio, IA más capaz, sin créditos de Meta | Marca en MX, flujos |
| **Clientify** | 39 / 59 / 79 / 99 € | Plan | n/d | Aparte | IA de agentes, WhatsApp más profundo | Email marketing, automatizaciones, propuestas |
| **HubSpot** | Starter 20/puesto; Pro 90–100/puesto | Puesto + contactos | **US$1.500–10.000 obligatorio** | WhatsApp solo en Pro+ | Precio 5–10× menor y WhatsApp nativo en todos los planes | Ecosistema, reportes, marca |
| **Pipedrive** | 14–99/puesto | Puesto | 0 | WhatsApp beta | WhatsApp e IA conversacional | Pipeline personalizable, integraciones |
| **Zoho Bigin/CRM** | 7–35/usuario | Usuario | Partners | Créditos | Simplicidad y WhatsApp-first | Precio de entrada, suite |
| **Respond.io** | 79 (5 us.) / 159 / 279 | Contactos activos (MAC) + puestos | 0 | Sin markup | CRM real (pipeline, bolsa), eventos, formularios, precio | Flujos, voz IA, madurez |
| **Wati** | ~49–59 / 99 / 299 | Plan + puestos | 0 | Aparte | CRM, IG/Messenger/email | Flujos, chatbot builder |
| **Botmaker** | 149 (3.000 usuarios/24 h) | Conversaciones | **US$99 alta WA** | Aparte | CRM completo | Bots de flujo |
| **Cliengo** | 45 / 119 / 259 | Conversaciones | Alta asistida | Aparte | CRM, campañas, IA | Chat web |
| **GoHighLevel** | 97 / 297 / 497 + AI Employee 97 | Agencia/sub-cuenta | 0 | Wallet rebill | Español, LATAM, simplicidad | White-label, funnels, citas, voz IA |
| **Chatwoot** | 19 / 39 / 99 por agente | Agente | 0 | Aparte | IA, CRM, campañas | Open source |

**Conclusiones:**

1. El rango real del mercado para un "CRM de WhatsApp con IA para equipos" es **US$79–250/mes por equipo**. Con 59 y 129, Maya se vendía como herramienta menor que Leadsales cuando hace más.
2. Casi nadie cobra setup propio salvo HubSpot, Botmaker (US$99) y los partners (US$500–3.000). **Cobrar US$149–449 es razonable si incluye trabajo real** (verificación Meta, migración, IA entrenada, capacitación) y se regala con el plan anual para no frenar la venta.
3. El estándar de 2026 para la IA son **créditos incluidos por plan + recargas sin rollover**. Kommo, Respond.io, Chatwoot y Clientify ya lo hacen así.
4. Meta **cobra los mensajes de servicio desde el 01-10-2026** (a tarifa de utilidad, con 1.000 gratis por número y mes). No incluir consumo de Meta en el plan y ofrecer el **conector QR** como alternativa barata en el plan Inicia.

---

## 5. Estructura de precios recomendada

### 5.1 Planes

**Métrica de valor:** plan por equipo con usuarios incluidos + créditos de IA. No se cobra por contacto activo, porque penaliza al cliente que crece y es difícil de explicar.

| Incluye | **Inicia — US$29** | **Crece — US$79** ⭐ | **Escala — US$169** | **Empresa — desde US$399** |
|---|---|---|---|---|
| Para quién | Emprendedor o equipo pequeño que arranca | Pyme con equipo comercial | Empresa con varios equipos o sedes | Operación grande, agencia, integración |
| Usuarios | 2 | 5 | 12 | A medida |
| Números WhatsApp | 1 | 2 | 5 | A medida |
| Conexión WhatsApp | QR o Cloud API | QR o Cloud API | QR o Cloud API | Cloud API + soporte |
| Instagram + Messenger | ✓ | ✓ | ✓ | ✓ |
| Buzones de correo | 1 | 3 | 10 | Ilimitados |
| Contactos | 2.000 | 15.000 | 60.000 | Ilimitados |
| Créditos de IA/mes | 500 | 3.000 | 10.000 | A medida |
| Agentes IA | 1 | 3 | Ilimitados | Ilimitados |
| Emails de campaña/mes | 1.000 | 10.000 | 40.000 | A medida |
| Formularios y listas | ✓ | ✓ | ✓ | ✓ |
| Pipeline + bolsa de oportunidades | ✓ | ✓ | ✓ | ✓ |
| Campañas masivas WhatsApp (plantillas Meta) | — | ✓ | ✓ | ✓ |
| Eventos con registro y check-in | — | ✓ | ✓ | ✓ |
| Dashboard de analítica completo | Básico | ✓ | ✓ | ✓ |
| Asistente de recuperación de clientes | — | — | ✓ | ✓ |
| Prospección con IA | — | — | ✓ | ✓ |
| Promotores y visitas | — | — | ✓ | ✓ |
| Multi-sede y roles a medida | — | — | ✓ | ✓ |
| Soporte | Chat | WhatsApp prioritario | WhatsApp + gerente de éxito | SLA + gerente dedicado |

**Anual:** paga 10 meses y usa 12 (≈17 % de descuento) y la puesta en marcha va incluida. **Mensual:** sin permanencia. **Prueba:** 14 días gratis sin tarjeta; ya existe `trialEndsAt` al registrarse.

### 5.2 Créditos de IA (unidad única de consumo)

| Acción | Créditos |
|---|---|
| Respuesta de un agente IA (texto) | 1 |
| Nota de voz transcrita / imagen / PDF escaneado interpretado | 2 |
| Conversación analizada por el asistente de recuperación | 3 |
| Empresa investigada en prospección | 10 |
| Generación de copy (campaña, evento) | 1 |

Los créditos no se acumulan de un mes a otro. Si el cliente usa **sus propias API keys de IA**, no consume créditos. Esto ya es posible porque cada tenant puede configurar sus keys.

**Margen:** una respuesta con Claude Haiku 4.5 o DeepSeek cuesta en torno a US$0,001–0,004 (hay que medirlo). Con 3.000 créditos, el plan Crece cuesta ≤ US$12 de IA en el peor caso, así que el margen bruto queda por encima del 80 %.

### 5.3 Add-ons

| Add-on | Precio |
|---|---|
| Usuario adicional | US$12/mes (Inicia y Crece) · US$10/mes (Escala) |
| Número de WhatsApp adicional | US$15/mes |
| Paquete 1.000 créditos IA | US$15 |
| Paquete 5.000 créditos IA | US$59 |
| 10.000 contactos adicionales | US$10/mes |
| 10.000 emails de campaña adicionales | US$9 |
| Sede adicional (Escala) | US$25/mes |

### 5.4 Precios para Perú (soles, + IGV)

Pagar en moneda local reduce la fricción de la primera compra, calza con la facturación electrónica y con el cobro vía MercadoPago/Culqi/Izipay, y los competidores no lo ofrecen porque publican en dólares. No es la conversión exacta: queda ~10–15 % por debajo, con cifras redondas (TC de referencia ~S/ 3,65).

| | Mensual | Anual (2 meses gratis) |
|---|---|---|
| Inicia | S/ 89 | S/ 890 |
| Crece | S/ 249 | S/ 2.490 |
| Escala | S/ 549 | S/ 5.490 |
| Puesta en marcha | S/ 490 (gratis con plan anual) | |
| Implementación Pro | S/ 1.490 | |
| Implementación Empresa | desde S/ 3.990 | |

Add-ons: usuario S/ 39/mes · número WhatsApp S/ 49/mes · 1.000 créditos IA S/ 49 · 5.000 créditos S/ 199 · 10.000 contactos S/ 35/mes · 10.000 emails S/ 29.

La lista **no se baja**: Crece ya cuesta menos que Leadsales con más producto. Solo se revisa si más de la mitad de las 10–15 primeras llamadas de venta en Perú objeta el precio después de la demo, y en ese caso se toca primero Inicia, no Crece. En la landing se muestran soles por defecto cuando la zona horaria del navegador es `America/Lima`.

### 5.5 Mensajes de WhatsApp (Meta)

- Los **cobra Meta directo** a la tarjeta del cliente en su cuenta de WhatsApp Business. Maya **no pone recargo**.
- Referencia por mensaje de marketing (?, hay que confirmar con el CSV oficial de Meta): MX ~0,03–0,04 · CO ~0,0125 · PE ~0,07 · CL ~0,089 · AR ~0,062 · BR ~0,0625.
- Desde el 01-10-2026, los mensajes de servicio se cobran a tarifa de utilidad, con 1.000 gratis por número y mes.
- Con el conector QR no hay costo por mensaje, pero hay un límite diario anti-bloqueo (50/día por defecto).

---

## 6. Implementación (pago único)

| Paquete | Precio | Incluye |
|---|---|---|
| **Autoservicio** | US$0 | Guías y videos; el cliente conecta sus cuentas. Soporte por chat. |
| **Puesta en marcha** | **US$149** (gratis con plan anual) | Conexión de 1 WhatsApp (QR o Cloud API), Instagram y Messenger · 1 buzón de correo · importación de la base (hasta 5.000 contactos) · 1 agente IA configurado con sus documentos · 2 formularios · 1 capacitación de 90 min · 7 días de acompañamiento |
| **Implementación Pro** | **US$449** (50 % menos con plan anual Escala) | Todo lo anterior + **verificación de Meta Business y alta en Cloud API** · hasta 10 plantillas aprobadas · hasta 3 agentes IA entrenados · pipeline, bolsa y reglas de reparto · roles y permisos · migración desde otro CRM o Excel (hasta 50.000 contactos) · 3 capacitaciones (dirección, ventas, marketing) · 30 días de acompañamiento por WhatsApp |
| **Empresa / a medida** | **desde US$1.200** | Multi-sede, varias marcas, integraciones con sistemas propios, migraciones complejas, capacitación presencial o por sede |

**Servicios sueltos:** capacitación adicional US$40 por sesión · hora de consultoría o configuración US$50 · campaña de recuperación "llave en mano" (análisis + plantillas + envío) US$199.

**Por qué funciona:** con más del 70 % de pymes de baja madurez digital, conectar Cloud API y verificar el negocio en Meta es la fricción número uno. Cobrarla filtra a los curiosos, financia el soporte y el cliente que invierte en la implementación se da menos de baja. Regalarla en el plan anual mueve la venta hacia el anual.

---

## 7. Economía unitaria (objetivo)

| Plan | Precio | Costo variable estimado | Margen bruto |
|---|---|---|---|
| Inicia | 29 | ~US$3 (IA + infra + S3) | ~90 % |
| Crece | 79 | ~US$12 | ~85 % |
| Escala | 169 | ~US$30 | ~82 % |

**Mezcla de referencia** (60 % Crece, 25 % Inicia, 15 % Escala): ARPU ≈ US$80/mes.

| Hito | Clientes |
|---|---|
| US$5.000 MRR | ~63 |
| US$10.000 MRR | ~125 |

Los números reales hay que **medirlos** con el sistema de consumo del punto 8 (P0).

---

## 8. Funcionalidades que faltan (priorizadas por rentabilidad)

### P0 — Sin esto no se puede cobrar (0–6 semanas)

1. **Suscripciones y pagos.** Stripe (internacional) + MercadoPago (MX/CO/PE/CL/AR): checkout, webhook, estados `trialing/active/past_due/canceled`, portal de facturación y bloqueo suave al vencer.
2. **Planes con límites aplicados.** Modelo `plan` con cuotas (usuarios, números, contactos, buzones, agentes, emails); guard en backend y avisos en frontend. El campo `tenant.plan` ya existe.
3. **Medición de consumo.** Contador de créditos IA por tenant y mes en `ai.service`: respuestas, transcripción, recuperación, prospección, copy. Contadores de emails y contactos. Pantalla "Mi plan y consumo".
4. **Email de campañas con dominio propio del cliente** (DKIM/SPF en Resend) + seguimiento de aperturas y clics + enlace de baja. Hoy todo sale desde una dirección de la plataforma, lo que perjudica la entregabilidad y la marca.
5. **Tarifas de Meta por país** en el estimador de campañas (hoy fijo en 0,0625).

### P1 — Suben el ARPU y justifican Crece/Escala (6–14 semanas)

6. **Automatizaciones / secuencias:** disparador (formulario, etiqueta, etapa, sin respuesta en X días) → esperar → enviar WA/email → mover etapa. Es la brecha número 1 frente a Kommo, Respond.io y Clientify.
7. **Agenda y citas:** enlace de reserva, sincronización con Google/Outlook Calendar y recordatorios por plantilla de utilidad. Es crítico para clínicas y academias; se puede reaprovechar el módulo oculto de Reservas.
8. **Etapas y embudos personalizables.** Hoy son 7 etapas fijas en código.
9. **Asignación automática round-robin** de leads entrantes, sobre la bolsa que ya existe.
10. **Meta Lead Ads + reporte de ROI de anuncios click-to-WhatsApp.** Ya se captura `ctwa_clid`; falta el reporte por campaña o anuncio. Es un argumento clave para inmobiliarias y automotriz.
11. **API pública + webhooks por tenant + Zapier/Make.** Va en Escala y Empresa.

### P2 — Nuevos ingresos (3–6 meses)

12. **Plan Agencia / white-label:** sub-cuentas por cliente, dominio y logo propios, precio mayorista (ej. US$299/mes con 5 sub-cuentas). El campo `branding` ya existe.
13. **Cotizaciones y links de pago** (MercadoPago/Stripe) desde la conversación.
14. **Campañas por Instagram DM** (el diseño ya está en `docs/instagram-dm-campaigns.md`).
15. **App iOS** (Capacitor ya está montado).
16. **IA de voz y llamadas** como add-on de alto margen.

### Deuda a corregir

- `docs/whatsapp-setup.md` describe Evolution API, que no está soportada.
- Las reglas de listas dinámicas usan campos de hostelería (`totalReservations`, `daysSinceLastVisit`).
- Hay que hacer la prueba E2E del asistente de recuperación antes de venderlo como feature de Escala.

---

## 9. Go-to-market (90 días)

1. **Semanas 1–2:** publicar los precios en el landing (hecho) y vender con cobro manual (link de pago) mientras se construye el billing P0.
2. **Semanas 1–6:** billing + cuotas + consumo (P0).
3. **Oferta de lanzamiento:** precio fundador de por vida −30 % para los primeros 50 clientes anuales + Puesta en marcha gratis.
4. **Canal:** anuncios click-to-WhatsApp dirigidos a inmobiliarias, academias y clínicas en PE/MX/CO. Los 72 h de conversación son gratis y Maya ya registra la atribución.
5. **Partners:** agencias de marketing con 20 % recurrente mientras llega el white-label.
6. **Métricas:** conversión de prueba a pago, porcentaje de ventas anuales, adopción de implementación de pago, churn mensual (<3 %), consumo de créditos por plan.

---

## Fuentes

- Mercado: [Grand View Research](https://www.grandviewresearch.com/horizon/outlook/customer-relationship-management-market/latin-america) · [MRFR](https://www.marketresearchfuture.com/reports/south-america-crm-software-market-46244) · [IMARC](https://www.imarcgroup.com/latin-america-software-as-a-service-market) · [Statista WhatsApp LATAM](https://www.statista.com/statistics/1323702/whatsapp-penetration-latin-american-countries/) · [Aurora Inbox](https://www.aurorainbox.com/en/2026/03/05/whatsapp-business-latam-adoption/)
- Competencia: [Leadsales pricing](https://leadsales.io/en/pricing/) · [Respond.io pricing](https://respond.io/pricing) · [Clientify precios](https://clientify.com/precios) · [HubSpot WhatsApp](https://www.hubspot.com/products/whatsapp-integration) · [SleekFlow sobre Kommo](https://sleekflow.io/blog/kommo-comparison) · [HighLevel](https://help.gohighlevel.com/support/solutions/articles/155000001428)
- Meta: [Precios oficiales](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) · [360dialog, cambio 01-10-2026](https://360dialog.com/blog/whatsapp-service-message-charging-october-2026/) · [Respond.io, cambio 2026](https://respond.io/blog/whatsapp-pricing-change-2026)
