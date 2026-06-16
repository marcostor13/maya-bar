# Plataforma SaaS Multitenant para Hospitalidad
## Documento de Producto e Historias de Usuario

**Versión:** 1.0
**Fecha:** Mayo 2026
**Tipo:** Product Requirements Document + User Stories

---

## 1. Resumen Ejecutivo

### 1.1 Visión
Plataforma SaaS multitenant que unifica la operación digital de restaurantes, bares y negocios de consumo: pedido por QR en mesa, gestión de cola en cocina/barra/recepción, reservas, generación de landings para eventos con IA, CRM con leads, mensajería masiva (WhatsApp + email) y automatizaciones. Una sola plataforma reemplaza 5–7 herramientas que hoy las empresas usan por separado (POS, reservas, mailing, CRM, landing builder, KDS, scheduler).

### 1.2 Diferenciadores estratégicos
1. **Multitenant con multi-local y multi-rubro**: una empresa matriz puede gestionar un restaurante peruano, un café y un bar bajo la misma cuenta, con configuración independiente por local pero CRM y analítica consolidados.
2. **AI integrada operativamente** (no como gimmick): generación de landings, redacción de campañas, sugerencias de envío óptimo y resúmenes de KPIs.
3. **Comunicación dual WhatsApp**: soporte tanto para Evolution API (no oficial, bajo costo) como WhatsApp Cloud API (oficial, escalable). El cliente elige según madurez.
4. **Cola de pedidos unificada**: dine-in, delivery y takeaway en la misma vista, ruteables a estaciones distintas (cocina, barra, postres).

### 1.3 Modelo de negocio sugerido
SaaS por suscripción mensual con tiers (Starter/Pro/Enterprise) según locales activos, mesas y volumen de envíos. Add-ons por módulo (Eventos, Automatización avanzada, WhatsApp Cloud).

---

## 2. Investigación de Mercado e Insights 2026

### 2.1 Tendencias clave validadas
- **AI ordering y personalización**: 82% de ejecutivos del sector están aumentando inversión en AI; los QR ya no llevan a un PDF estático sino a experiencias personalizadas con info de alérgenos, sugerencias y ofertas contextuales.
- **Reservas direct-to-restaurant**: el mercado se mueve de OpenTable/aggregators (con comisión por cubierto) a sistemas propios. Los algoritmos de seating inteligente mejoran el turnover de mesas en 15–20%.
- **KDS con order throttling**: los kitchen display modernos balancean carga automáticamente para evitar bottlenecks en horas pico.
- **Personalización + privacidad**: la personalización ahora es obligación de cumplimiento (consent, retención, derecho a borrado). No es opcional para 2026.
- **Unified backend**: mismas data de menú/precios/stock en QR, web, kioskos, delivery — fin de la fragmentación.

### 2.2 Competidores referencia
| Plataforma | Fuerte en | Brecha que aprovechamos |
|---|---|---|
| Toast | POS + KDS, EE.UU. | Costo alto, no LATAM-friendly, sin landing/eventos |
| Choice (CEE) | QR + reservas all-in-one | Sin generador AI de landings ni CRM completo |
| EatApp | Reservas commission-free | Solo reservas, no orders ni eventos |
| Restolabs | QR dine-in + multi-canal | Sin módulo de eventos ni automatización avanzada |
| QrexOrder | QR + WhatsApp + AI menú | Sin KDS profesional ni reservas avanzadas |

### 2.3 Funcionalidades de alto valor recomendadas (no estaban en spec original)

Estas adiciones tienen ratio **alto valor / bajo esfuerzo de desarrollo** y deberían integrarse:

| # | Funcionalidad | Por qué | Esfuerzo |
|---|---|---|---|
| A1 | **QR específico por mesa** (auto-rellena `table_id`) | UX dramáticamente mejor; estándar en 2026 | S |
| A2 | **Tracking público de pedido** (URL con estado en vivo) | Reduce consultas al staff; cero costo si ya hay estados | S |
| A3 | **Sistema 86 / disable de ítems en tiempo real** | Crítico operativo; evita pedidos de items agotados | S |
| A4 | **Pre-pago y split bill por QR** | Acelera cierre; alta demanda en LATAM con Yape/Plin/MercadoPago | M |
| A5 | **Loyalty básico** (contador de visitas, recompensa simple) | Retención; reusa data del CRM | M |
| A6 | **Alérgenos y tags dietéticos** en menú | Compliance + experiencia | S |
| A7 | **Anti-no-show**: depósitos opcionales y recordatorios automáticos | Recupera 15–20% de revenue perdida | M |
| A8 | **Waitlist para walk-ins** con notificación WhatsApp cuando hay mesa | Aprovecha tráfico no reservado | M |
| A9 | **Floor plan / mapa de mesas** drag & drop | Operativa visual del host | M |
| A10 | **Encuesta post-visita automática** (NPS via WhatsApp) | Feedback continuo + reseñas Google | S |
| A11 | **Multi-idioma del menú** (ES/EN/PT) | Lima/LATAM con turismo | S |
| A12 | **Audit log y permisos granulares por rol** | Enterprise-ready desde día 1 | M |
| A13 | **Webhooks salientes** para integraciones futuras | API-first; permite contabilidad, ERPs | S |
| A14 | **White-label por tenant** (subdominio + branding) | Justifica tier Enterprise | M |
| A15 | **Integración Yape/Plin/MercadoPago/Culqi** (Perú/LATAM) | Pagos locales son must-have | M |

---

## 3. Actores / Personas del sistema

| Persona | Descripción | Acceso principal |
|---|---|---|
| **Super Admin (Plataforma)** | Operador del SaaS (tu equipo); gestiona tenants, planes, facturación | Panel global |
| **Tenant Admin (Dueño)** | Dueño de la empresa; ve todos sus locales, KPIs, contratos | Panel empresa |
| **Manager de Local** | Encargado de un local específico; gestiona staff, menú, reservas | Panel local |
| **Host / Recepción** | Recibe clientes; gestiona reservas, waitlist, asigna mesas | Vista host |
| **Mozo / Server** | Toma pedidos, lleva platos, cierra cuentas | App móvil staff |
| **Cocinero** | Ve cola de cocina, marca preparación | KDS cocina |
| **Bartender** | Ve cola de barra, marca preparación | KDS barra |
| **Marketing Manager** | Diseña campañas, landings, gestiona CRM y leads | Panel marketing |
| **Comensal en mesa** | Cliente final escaneando QR | Web móvil sin login |
| **Cliente delivery / take-out** | Pide remoto | Web pública del local |
| **Asistente a evento** | Se registra vía landing page | Landing pública |

---

## 4. Arquitectura funcional (alto nivel)

```
┌─────────────────────────────────────────────────────────────┐
│                    SUPER ADMIN (Plataforma)                  │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  TENANT (Empresa)                                            │
│  ├── Configuración global, branding, plan, facturación       │
│  ├── CRM consolidado (leads de todos los locales)            │
│  ├── Automatizaciones globales                               │
│  └── Locales (1..N)                                          │
│       ├── Local A (Restaurante)                              │
│       │    ├── Menú / Carta                                  │
│       │    ├── Mesas / Floor plan / QR                       │
│       │    ├── Reservas                                      │
│       │    ├── Cola pedidos (Salón / Delivery / Takeaway)   │
│       │    ├── KDS (Cocina, Barra, Postres)                 │
│       │    └── Eventos / Landings                            │
│       ├── Local B (Bar)                                      │
│       └── Local C (Café)                                     │
└─────────────────────────────────────────────────────────────┘
```

**Jerarquía de datos:**
`Plataforma → Tenant → Local → (Mesas | Menú | Reservas | Pedidos | Eventos | Staff)`

**CRM y campañas son a nivel Tenant** (cliente de la empresa, no del local) pero con segmentación por local.

---

## 5. Épicas e Historias de Usuario

> **Convención:** prioridad MoSCoW para MVP — `M` Must, `S` Should, `C` Could, `W` Won't (fase posterior).
> Estimación: `S` (≤3d), `M` (1 sprint), `L` (2 sprints), `XL` (>2 sprints).

---

### 📦 ÉPICA 1 — Onboarding y Arquitectura Multitenant

#### HU-1.1 — Registro de empresa
**Como** dueño de un negocio
**Quiero** registrarme en la plataforma con datos de mi empresa (RUC/NIF, razón social, contacto)
**Para** comenzar a configurar mis locales.
**Criterios:** Validación de email, prueba gratuita 14 días, captura RUC con validación de formato. Auto-creación del primer local en wizard.
**Prioridad:** M | **Estimación:** M

#### HU-1.2 — Wizard de creación de local
**Como** Tenant Admin
**Quiero** un asistente paso-a-paso que me cree un local (rubro, dirección, horarios, mesas, menú base por plantilla)
**Para** estar operativo en menos de 30 minutos.
**Criterios:** Plantillas por rubro (restaurante, bar, café, cafetería, fast food). Importación CSV de menú. Generación automática de QRs por mesa.
**Prioridad:** M | **Estimación:** L

#### HU-1.3 — Gestión de múltiples locales bajo una empresa
**Como** Tenant Admin
**Quiero** crear, clonar, archivar y editar locales desde un único panel
**Para** escalar mi negocio sin cuentas duplicadas.
**Criterios:** Acción "duplicar local" copia menú/configuración. Switch rápido entre locales en navbar. Vista consolidada multi-local.
**Prioridad:** M | **Estimación:** M

#### HU-1.4 — Branding por tenant (white-label)
**Como** Tenant Admin
**Quiero** subir logo, colores, fuente y fondo
**Para** que tanto el panel interno como las páginas públicas (QR, landings, emails) reflejen mi marca.
**Criterios:** Branding heredable por local con override. Variables CSS dinámicas. Subdominio personalizado opcional (`mirestaurante.plataforma.com`).
**Prioridad:** S | **Estimación:** M

#### HU-1.5 — Roles y permisos granulares
**Como** Tenant Admin
**Quiero** crear roles personalizados con permisos finos (ver/editar/borrar por módulo)
**Para** dar a cada miembro del equipo solo lo que necesita.
**Criterios:** 5 roles default (Admin, Manager, Host, Cocina, Marketing), custom ilimitados. Permisos por módulo y por local.
**Prioridad:** S | **Estimación:** M

#### HU-1.6 — Audit log
**Como** Tenant Admin
**Quiero** ver un registro de quién hizo qué y cuándo
**Para** auditoría y resolución de incidentes.
**Criterios:** Filtro por usuario, fecha, módulo, acción. Retención mínima 90 días. Exportable CSV.
**Prioridad:** S | **Estimación:** M

---

### 📦 ÉPICA 2 — Catálogo y Menú Digital

#### HU-2.1 — Crear y organizar menú con categorías
**Como** Manager de Local
**Quiero** crear categorías (entradas, principales, postres, bebidas) y agregar ítems con foto, descripción, precio, variantes y modificadores
**Para** que el cliente vea una carta atractiva y completa.
**Criterios:** Drag & drop de orden. Variantes (tamaño, punto de cocción), modificadores (extras, sin tomate). Múltiples fotos por ítem.
**Prioridad:** M | **Estimación:** L

#### HU-2.2 — Tags dietéticos y alérgenos
**Como** comensal
**Quiero** filtrar el menú por vegetariano/vegano/sin gluten/sin lactosa/spicy
**Para** ordenar con seguridad según mis restricciones.
**Criterios:** Iconos visibles en tarjeta de ítem. Filtro persistente. Alérgenos críticos (8 grandes) destacados.
**Prioridad:** S | **Estimación:** S

#### HU-2.3 — Stock / sistema 86 en tiempo real
**Como** cocinero o manager
**Quiero** marcar un ítem como "agotado hoy" con un toggle
**Para** que el cliente no pueda ordenarlo y evitar reclamos.
**Criterios:** Cambio refleja en QR público en <5s. Auto-restablecer al día siguiente o tras X horas configurable. Alerta visual en panel.
**Prioridad:** M | **Estimación:** S

#### HU-2.4 — Menú multi-idioma
**Como** Manager
**Quiero** agregar traducciones (ES/EN/PT mínimo) a categorías e ítems
**Para** atender turismo y clientes internacionales.
**Criterios:** Botón "traducir con AI" sugiere traducción editable. Cliente cambia idioma desde el QR.
**Prioridad:** S | **Estimación:** M

#### HU-2.5 — Carta por horario / día
**Como** Manager
**Quiero** definir disponibilidad por ítem (solo desayuno, solo fines de semana, happy hour)
**Para** controlar oferta sin gestión manual.
**Criterios:** Reglas por hora/día/fecha. Fechas especiales (Día de la Madre, etc.). Preview por horario.
**Prioridad:** S | **Estimación:** M

#### HU-2.6 — Ruteo de ítem a estación
**Como** Manager
**Quiero** asignar cada ítem a una estación (cocina, barra, postres)
**Para** que el pedido llegue al KDS correcto cuando se ordena.
**Criterios:** Estaciones configurables por local. Un ítem puede ir a múltiples estaciones (ej: trago + bocaditos). Vista preview del ruteo.
**Prioridad:** M | **Estimación:** M

---

### 📦 ÉPICA 3 — Pedidos en Local (QR)

#### HU-3.1 — Generación masiva de QRs por mesa
**Como** Manager
**Quiero** generar QRs imprimibles uno por mesa con identificación visible
**Para** repartirlos físicamente y cada uno ya sepa a qué mesa pertenece.
**Criterios:** PDF con QR + número de mesa, en grilla A4. Tamaños configurables. URL incluye `tenant_id` + `local_id` + `table_id`.
**Prioridad:** M | **Estimación:** S

#### HU-3.2 — Escaneo y carga de menú
**Como** comensal
**Quiero** escanear el QR de mi mesa y ver inmediatamente la carta
**Para** no esperar al mozo y ordenar a mi ritmo.
**Criterios:** Sin login obligatorio. Carga <2s en 4G. Mesa pre-asignada visible en pantalla. Funciona offline en cola si red flaquea (reintenta).
**Prioridad:** M | **Estimación:** M

#### HU-3.3 — Carrito y envío de pedido
**Como** comensal
**Quiero** agregar ítems con notas (ej. "sin cebolla"), revisar carrito y enviar
**Para** ordenar de manera precisa.
**Criterios:** Notas por ítem. Confirmación clara antes de enviar. Pedidos múltiples a lo largo de la visita acumulables en la cuenta.
**Prioridad:** M | **Estimación:** M

#### HU-3.4 — Tracking público del pedido
**Como** comensal
**Quiero** ver el estado de mi pedido (recibido → en preparación → listo → servido)
**Para** saber cuánto falta sin preguntar al mozo.
**Criterios:** URL única por pedido con timestamps por estado. Auto-refresh. Funciona también para delivery con tracking del repartidor.
**Prioridad:** S | **Estimación:** M

#### HU-3.5 — Pre-pago / pago en mesa por QR
**Como** comensal
**Quiero** pagar mi cuenta desde mi celular (tarjeta, Yape, Plin, MercadoPago)
**Para** no esperar al mozo con el POS.
**Criterios:** Integración mínima con 1 PSP regional (Culqi/MercadoPago) y 1 wallet (Yape/Plin). Recibo digital al email/WhatsApp.
**Prioridad:** S | **Estimación:** L

#### HU-3.6 — Split bill
**Como** grupo de comensales
**Quiero** dividir la cuenta por persona o por ítem
**Para** pagar lo que cada uno consumió.
**Criterios:** Modos: equitativo, por ítems, custom. Cada quien paga su parte por separado vía link.
**Prioridad:** C | **Estimación:** M

#### HU-3.7 — Llamar al mozo / pedir cuenta
**Como** comensal
**Quiero** pulsar un botón para llamar al mozo o pedir la cuenta
**Para** comunicarme sin levantar la mano.
**Criterios:** Notificación al staff con número de mesa. Sonoro + visual. Anti-spam (cooldown 30s).
**Prioridad:** S | **Estimación:** S

---

### 📦 ÉPICA 4 — Cola de Pedidos & KDS

#### HU-4.1 — Vista unificada de cola por local
**Como** manager
**Quiero** ver todos los pedidos del local agrupados por estado (pendientes, en preparación, listos, servidos/entregados)
**Para** tener control operativo en tiempo real.
**Criterios:** WebSocket / actualización push. Filtros: tipo (salón / delivery / takeaway), mesa, mozo. Ordenamiento por SLA (más antiguo primero).
**Prioridad:** M | **Estimación:** L

#### HU-4.2 — KDS por estación
**Como** cocinero/bartender
**Quiero** una pantalla solo con los ítems de mi estación con timer
**Para** trabajar enfocado sin distracción.
**Criterios:** Botón "bump" marca como listo. Color rojo si supera SLA (configurable). Modo nocturno. Funciona en tablet/touch.
**Prioridad:** M | **Estimación:** L

#### HU-4.3 — Diferenciación dine-in / delivery / takeaway
**Como** staff
**Quiero** que cada pedido muestre claramente su tipo y prioridad
**Para** despachar correctamente sin confusión.
**Criterios:** Badges de color. Delivery muestra dirección y nombre del repartidor. Takeaway muestra hora prometida.
**Prioridad:** M | **Estimación:** S

#### HU-4.4 — Order throttling inteligente
**Como** sistema
**Quiero** sugerir tiempos de preparación realistas según cola actual y capacidad de estación
**Para** evitar prometer 10 minutos cuando hay 30 órdenes en cola.
**Criterios:** Cálculo en base a cola activa + tiempo histórico promedio del ítem. Visible en mensaje al cliente.
**Prioridad:** S | **Estimación:** M

#### HU-4.5 — Modificación / anulación de pedido
**Como** mozo o manager
**Quiero** modificar o anular un pedido con motivo
**Para** corregir errores o atender devoluciones.
**Criterios:** Permisos según rol (mozo solo modifica antes de "en preparación"). Reflejo en KDS. Razón obligatoria. Auditable.
**Prioridad:** M | **Estimación:** M

#### HU-4.6 — Acceso multi-dispositivo a la cola
**Como** staff
**Quiero** acceder a la cola desde recepción, cocina, barra, móvil de mozo
**Para** que cada rol vea lo que necesita en su contexto.
**Criterios:** Vista por rol. Sincronización en vivo. Login rápido por PIN para uso compartido en tablet.
**Prioridad:** M | **Estimación:** M

#### HU-4.7 — Cierre de turno y reporte
**Como** manager
**Quiero** cerrar el turno con resumen de pedidos, ventas, propinas, anulados
**Para** cuadrar caja y reportar.
**Criterios:** Reporte PDF/email. Por turno y consolidado del día. Comparativa con mismo día semana anterior.
**Prioridad:** S | **Estimación:** M

---

### 📦 ÉPICA 5 — Delivery y Takeaway

#### HU-5.1 — Página pública del local con menú para delivery
**Como** cliente remoto
**Quiero** acceder a una URL pública del local y pedir delivery o takeaway
**Para** ordenar sin estar presente.
**Criterios:** SEO básico, foto, dirección, horarios. Selector zona delivery con cobertura validada por geolocalización/CP. Tiempo de entrega estimado.
**Prioridad:** M | **Estimación:** L

#### HU-5.2 — Gestión de zonas de delivery y costos
**Como** Manager
**Quiero** definir zonas de cobertura con costo de envío por zona
**Para** no entregar fuera de mi capacidad y cobrar correctamente.
**Criterios:** Polígonos en mapa o radio en km. Costo fijo o por km. Pedido mínimo por zona.
**Prioridad:** M | **Estimación:** M

#### HU-5.3 — Asignación de repartidor
**Como** Manager
**Quiero** asignar un pedido a un repartidor (interno o terceros)
**Para** despachar.
**Criterios:** Lista de repartidores con disponibilidad. Push al móvil del repartidor con dirección.
**Prioridad:** S | **Estimación:** M

#### HU-5.4 — Tracking de delivery para el cliente
**Como** cliente
**Quiero** ver en tiempo real dónde está mi pedido
**Para** estar listo cuando llegue.
**Criterios:** URL pública con mapa (si hay GPS del repartidor) o estados textuales mínimos (preparándose / en camino / entregado).
**Prioridad:** S | **Estimación:** M

---

### 📦 ÉPICA 6 — Reservas

#### HU-6.1 — Configuración de capacidad y horarios
**Como** Manager
**Quiero** definir mesas, capacidad por mesa, turnos de reserva, duración promedio
**Para** que el sistema gestione disponibilidad automáticamente.
**Criterios:** Turnos configurables (ej: 19:00 / 21:30). Bloqueos por mesa o rango horario. Calendario de eventos especiales con reglas distintas.
**Prioridad:** M | **Estimación:** L

#### HU-6.2 — Floor plan / mapa de mesas
**Como** Host
**Quiero** ver el salón como un plano con mesas que cambian de color según estado (libre, reservada, ocupada, sucia)
**Para** asignar visualmente.
**Criterios:** Editor drag & drop por Manager. Múltiples salones (interior, terraza). Drill-down: clic en mesa muestra reserva/cuenta.
**Prioridad:** S | **Estimación:** L

#### HU-6.3 — Reserva pública por el cliente
**Como** cliente
**Quiero** hacer una reserva online (fecha, hora, comensales, contacto, ocasión, requerimientos)
**Para** asegurar mi mesa.
**Criterios:** Calendario con disponibilidad real. Confirmación instantánea por email + WhatsApp. Sin login obligatorio (solo email/teléfono).
**Prioridad:** M | **Estimación:** L

#### HU-6.4 — Recordatorio automático y confirmación
**Como** sistema
**Quiero** enviar recordatorio 24h antes y pedir confirmación 2h antes vía WhatsApp/email
**Para** reducir no-shows.
**Criterios:** Templates configurables. Botón "confirmar" en WhatsApp. Si no confirma → libera mesa después de N min de la hora.
**Prioridad:** M | **Estimación:** M

#### HU-6.5 — Depósito anti no-show
**Como** Manager
**Quiero** opcional pedir depósito (S/. X por persona) para confirmar reserva en horarios premium
**Para** asegurar ingresos en alta demanda.
**Criterios:** Configurable por turno. Reembolso si cancela con anticipación >24h. Aplicable solo a reservas grandes (configurable umbral comensales).
**Prioridad:** S | **Estimación:** M

#### HU-6.6 — Waitlist para walk-ins
**Como** Host
**Quiero** registrar a clientes sin reserva en una lista de espera con tiempo estimado
**Para** notificarles por WhatsApp cuando hay mesa disponible.
**Criterios:** Estimación de tiempo basada en duración promedio. Botón notify enviar mensaje. Cliente confirma "voy" o "no puedo".
**Prioridad:** S | **Estimación:** M

#### HU-6.7 — Vinculación reserva → comanda
**Como** Host
**Quiero** que al asignar una mesa de reserva, esa mesa quede vinculada al comensal y sus pedidos lleguen al CRM
**Para** trazabilidad de cliente, no solo de mesa.
**Criterios:** Pedidos del QR en mesa vinculada cuentan en histórico del cliente del CRM.
**Prioridad:** S | **Estimación:** M

#### HU-6.8 — Preferencias e historial de cliente recurrente
**Como** Host
**Quiero** ver al recibir reserva si el cliente es recurrente, qué pidió antes, alergias, preferencias, fecha de cumpleaños
**Para** ofrecer experiencia personalizada.
**Criterios:** Vinculado al CRM. Notas privadas del staff por cliente.
**Prioridad:** S | **Estimación:** M

---

### 📦 ÉPICA 7 — Generador de Landing Pages para Eventos (con AI)

#### HU-7.1 — Crear evento
**Como** Marketing Manager
**Quiero** crear un evento con datos básicos (nombre, fecha, hora, local, capacidad, descripción)
**Para** comenzar a promocionarlo.
**Criterios:** Wizard con campos requeridos validados. Asociación a uno o más locales del tenant.
**Prioridad:** M | **Estimación:** S

#### HU-7.2 — Subir media (imágenes y videos)
**Como** Marketing Manager
**Quiero** subir varias imágenes y/o un video del evento
**Para** que la landing tenga contenido visual potente.
**Criterios:** Drag & drop múltiple. Compresión automática. Soporte mp4/webm <50MB. Reordenamiento.
**Prioridad:** M | **Estimación:** M

#### HU-7.3 — Generación AI de landing por prompt
**Como** Marketing Manager
**Quiero** describir el evento en lenguaje natural ("noche de jazz con cocteles, ambiente íntimo, dress code elegante") y que la AI genere copy, hero, secciones y estilo automáticamente
**Para** crear una landing en minutos sin diseñador.
**Criterios:** Prompt + media → preview de landing. Editor visual post-generación para ajustes. Templates base (Concierto, Cena, Workshop, Lanzamiento, Fiesta privada). Tono editable (formal/casual/elegante).
**Prioridad:** M | **Estimación:** XL

#### HU-7.4 — Editor visual post-AI
**Como** Marketing Manager
**Quiero** poder editar manualmente cualquier sección generada
**Para** afinar copy, colores, imágenes, secciones.
**Criterios:** Editor por bloques (hero, sobre el evento, agenda, ubicación, formulario, FAQ). Mover/eliminar/duplicar bloques.
**Prioridad:** M | **Estimación:** L

#### HU-7.5 — Formulario de registro a evento
**Como** Marketing Manager
**Quiero** insertar un formulario con campos custom (nombre, email, teléfono, +1, restricciones, etc.)
**Para** capturar leads y datos del asistente.
**Criterios:** Campos arrastrables. Validaciones. Captcha. Submit guarda en CRM y dispara automatización.
**Prioridad:** M | **Estimación:** M

#### HU-7.6 — QR del evento generado automáticamente
**Como** Marketing Manager
**Quiero** descargar el QR de la landing en alta resolución y en versiones (Instagram story, flyer, posters)
**Para** distribuirlo en distintos canales.
**Criterios:** Plantillas con branding del tenant. PDF imprimible y PNG/SVG para redes.
**Prioridad:** M | **Estimación:** S

#### HU-7.7 — Email de confirmación al asistente
**Como** asistente registrado
**Quiero** recibir un email confirmando mi inscripción con detalles del evento, calendario y QR de mi entrada
**Para** tener todo a mano.
**Criterios:** Email con plantilla AI. Add-to-calendar (.ics). QR único por asistente para check-in.
**Prioridad:** M | **Estimación:** M

#### HU-7.8 — Notificación al tenant
**Como** Marketing Manager
**Quiero** recibir email/WhatsApp cuando alguien se registra a un evento
**Para** seguimiento inmediato.
**Criterios:** Configurable on/off. Resumen diario alternativo para eventos grandes.
**Prioridad:** S | **Estimación:** S

#### HU-7.9 — Check-in del evento
**Como** staff en puerta
**Quiero** escanear el QR del asistente para validar entrada
**Para** controlar acceso.
**Criterios:** App/PWA simple con cámara. Feedback inmediato (válido/usado/inválido). Reporte de asistencia.
**Prioridad:** S | **Estimación:** M

#### HU-7.10 — Métricas del evento
**Como** Marketing Manager
**Quiero** ver visitas a la landing, conversión a registro, asistencia real
**Para** medir efectividad.
**Criterios:** Funnel visits → registers → check-ins. Fuente de tráfico (UTM). Comparativa entre eventos.
**Prioridad:** S | **Estimación:** M

---

### 📦 ÉPICA 8 — CRM y Gestión de Leads

#### HU-8.1 — Vista única de cliente (Customer 360)
**Como** Marketing Manager
**Quiero** ver el perfil completo de un cliente (datos, eventos asistidos, reservas, pedidos histórico, ticket promedio, NPS, tags)
**Para** tomar decisiones de comunicación informadas.
**Criterios:** Búsqueda por email/tel/nombre. Timeline cronológico de interacciones. Tags editables.
**Prioridad:** M | **Estimación:** L

#### HU-8.2 — Importación masiva de leads
**Como** Marketing Manager
**Quiero** subir un CSV/Excel con leads y mapear columnas
**Para** migrar mi base de contactos existente.
**Criterios:** Wizard de mapeo. Detección de duplicados (por email/teléfono). Tags de origen automáticas. Logs de importación con errores.
**Prioridad:** M | **Estimación:** M

#### HU-8.3 — Segmentación dinámica
**Como** Marketing Manager
**Quiero** crear segmentos con reglas (ej: "clientes que visitaron en últimos 30d Y gastaron >S/.150 Y no recibieron promo este mes")
**Para** dirigir campañas precisas.
**Criterios:** Builder visual de reglas AND/OR. Vista previa de tamaño de segmento. Segmentos guardados, dinámicos.
**Prioridad:** M | **Estimación:** L
**Estado:** ✅ Implementado — listas dinámicas con `SegmentRule[]` (campos: tags, source, totalReservations, totalEvents, daysSinceLastVisit). Preview en tiempo real via `POST /lists/preview-rules`.

#### HU-8.7 — Listas de contactos (estáticas y dinámicas)
**Como** Marketing Manager
**Quiero** organizar mis clientes en listas — curadas manualmente o definidas por reglas — y poder elegir una o varias listas como destino de una campaña
**Para** enviar comunicaciones segmentadas sin repetir destinatarios.
**Criterios:**
- Listas estáticas: agregar/quitar clientes individualmente o por búsqueda desde la vista de Clientes.
- Listas dinámicas: definir reglas (tags, origen, reservaciones, días desde última visita). La membresía se evalúa al momento del envío.
- Vista previa de cantidad de destinatarios únicos (deduplicados) al seleccionar múltiples listas.
- CRUD de listas con nombre, descripción, color identificador.
- Las campañas pueden apuntar a "Todos los clientes", "Por etiquetas" o "Por listas".
**Prioridad:** M | **Estimación:** L
**Estado:** ✅ Implementado — `ContactList` schema, `ListsService`, `ListsController`, `/lists` frontend con drawer + rule builder.

#### HU-8.4 — Gestión de consentimiento (GDPR-ready)
**Como** Tenant Admin
**Quiero** registrar consentimiento por canal (email/WhatsApp/SMS) y permitir unsubscribe
**Para** cumplir privacidad y evitar quejas.
**Criterios:** Doble opt-in opcional. Link unsubscribe automático en cada envío. Histórico de consentimientos.
**Prioridad:** M | **Estimación:** M

#### HU-8.5 — Tags y notas internas
**Como** Marketing Manager o Manager de Local
**Quiero** agregar tags ("VIP", "alérgico al maní", "celíaco", "celebra cumpleaños en mayo") y notas privadas a un cliente
**Para** atención personalizada y segmentación.
**Criterios:** Tags multi-tenant. Notas con autor y timestamp.
**Prioridad:** S | **Estimación:** S

#### HU-8.6 — Loyalty básico
**Como** comensal recurrente
**Quiero** acumular puntos por cada visita/pedido y canjearlos por descuentos
**Para** sentirme reconocido.
**Criterios:** Reglas configurables (1 punto = S/.X, premio = N puntos). Visible al cliente vía WhatsApp/email/QR. Lectura del programa por mozo en POS.
**Prioridad:** S | **Estimación:** L

---

### 📦 ÉPICA 9 — Comunicaciones (WhatsApp y Email)

#### HU-9.1 — Conexión Evolution API
**Como** Tenant Admin
**Quiero** conectar mi instancia Evolution API con QR scan
**Para** enviar mensajes WhatsApp masivos a bajo costo.
**Criterios:** Onboarding guiado. Detección automática de desconexiones con alerta. Soporte multi-instancia (varios números).
**Prioridad:** M | **Estimación:** M

#### HU-9.2 — Conexión WhatsApp Cloud API (Meta oficial)
**Como** Tenant Admin
**Quiero** conectar la API oficial con mi WABA y plantillas aprobadas
**Para** envíos oficiales escalables sin riesgo de baneo.
**Criterios:** Wizard de conexión con Meta. Sincronización de plantillas aprobadas. Selector de canal por campaña (Evolution o Cloud).
**Prioridad:** M | **Estimación:** L

#### HU-9.3 — Editor de campañas de WhatsApp y Email
**Como** Marketing Manager
**Quiero** crear una campaña con segmento, plantilla y variables personalizadas
**Para** enviar a miles de leads vía WhatsApp o email.
**Criterios:** Preview con variables sustituidas. Test envío a 5 destinos. Throttling configurable (ej. 50 msg/min). Programación.
**Estado parcial:** ✅ Implementado — campañas email + WhatsApp con tres modos de targeting: Todos los clientes / Por etiquetas / Por listas de contactos. Variable `{nombre}` soportada. Pendiente: throttling, programación, test envío, reportes detallados.

#### HU-9.4 — Integración con proveedor de email masivo
**Como** Tenant Admin
**Quiero** conectar un proveedor (Resend / SendGrid / Mailgun / Amazon SES)
**Para** enviar emails masivos con buena entregabilidad.
**Criterios:** Onboarding por API key. Verificación de dominio (SPF/DKIM/DMARC). Reporte de delivery/bounces/opens/clicks.
**Prioridad:** M | **Estimación:** M

#### HU-9.5 — Editor de email con bloques + AI
**Como** Marketing Manager
**Quiero** un editor drag & drop con bloques (hero, texto, imagen, botón, columnas) y generación AI de copy y diseño desde un prompt
**Para** crear emails de calidad sin diseñador.
**Criterios:** Plantillas base. Generación AI con variantes A/B. Preview mobile/desktop. Test antispam (score).
**Prioridad:** M | **Estimación:** XL

#### HU-9.6 — Programación y throttling
**Como** Marketing Manager
**Quiero** programar envíos para una fecha/hora y controlar la velocidad
**Para** no saturar deliverability ni alarmar al sistema antispam.
**Criterios:** Calendario de envíos. Cancelable antes del start. Throttling por hora.
**Prioridad:** S | **Estimación:** M

#### HU-9.7 — Reportes de envío
**Como** Marketing Manager
**Quiero** ver entregados, abiertos, clicks, bounces, unsubscribes por campaña
**Para** medir y optimizar.
**Criterios:** Dashboard por campaña + agregado. Drill-down a destinatarios.
**Prioridad:** M | **Estimación:** M

---

### 📦 ÉPICA 10 — Automatizaciones

#### HU-10.1 — Builder visual de workflows
**Como** Marketing Manager
**Quiero** crear flujos con triggers, condiciones y acciones (estilo Zapier/n8n light)
**Para** automatizar comunicaciones sin tocar código.
**Criterios:** Triggers: registro evento, pedido completado, reserva confirmada, no-show, cumpleaños, X días sin visita. Acciones: enviar WhatsApp, email, agregar tag, mover a segmento, crear tarea. Condiciones: si gasto >X, si segmento Y.
**Prioridad:** M | **Estimación:** XL

#### HU-10.2 — Automatizaciones plantilla (preset)
**Como** Marketing Manager novato
**Quiero** activar workflows ya hechos (recordatorio reserva, encuesta NPS post-visita, cumpleaños, recuperación cliente inactivo, bienvenida nuevo lead)
**Para** valor inmediato sin diseñar.
**Criterios:** 8–10 plantillas curadas. Activar con un clic. Editables.
**Prioridad:** M | **Estimación:** M

#### HU-10.3 — Encuesta NPS post-visita automática
**Como** Marketing Manager
**Quiero** que tras X horas de cerrar mesa o entregar delivery se envíe encuesta breve por WhatsApp/email
**Para** medir satisfacción y captar reseñas.
**Criterios:** Si NPS ≥9 → invitar a dejar reseña Google. Si <7 → notificar al manager para follow-up.
**Prioridad:** S | **Estimación:** M

#### HU-10.4 — Generación AI de contenido para automatizaciones
**Como** Marketing Manager
**Quiero** que la AI sugiera el copy del mensaje según contexto del trigger
**Para** no escribir desde cero.
**Criterios:** Prompt template por trigger. Tono editable. A/B variantes.
**Prioridad:** S | **Estimación:** M

#### HU-10.5 — Pausa global de automatizaciones
**Como** Tenant Admin
**Quiero** pausar todas las automatizaciones de golpe (ej: durante mantenimiento, crisis PR)
**Para** control de emergencia.
**Criterios:** Toggle global. Log de pausa con motivo.
**Prioridad:** C | **Estimación:** S

---

### 📦 ÉPICA 11 — Analítica y KPIs

#### HU-11.1 — Dashboard ejecutivo del tenant
**Como** Tenant Admin
**Quiero** un dashboard con KPIs consolidados de todos mis locales (ventas, ticket promedio, ocupación, clientes nuevos vs recurrentes, NPS, conversión de eventos)
**Para** decisiones macro.
**Criterios:** Filtro por rango de fechas y por local. Comparativas vs período anterior. Exportable PDF.
**Prioridad:** M | **Estimación:** L

#### HU-11.2 — Dashboard operativo del local
**Como** Manager
**Quiero** ver KPIs del día/semana de mi local (ventas/hora, tiempos de preparación, mesas ocupadas, items top, ítems con bajo margen)
**Para** ajustar operación en vivo.
**Criterios:** Métricas en tiempo real (5–15 min refresh). Alertas si algún KPI sale de rango.
**Prioridad:** M | **Estimación:** L

#### HU-11.3 — Resúmenes AI (insights interpretativos)
**Como** Tenant Admin
**Quiero** un resumen semanal generado por AI con insights ("tus ventas de delivery cayeron 12% lunes y martes; los clientes de tu local Miraflores están pidiendo más postres en happy hour")
**Para** acción sin tener que mirar 10 dashboards.
**Criterios:** Email/WhatsApp semanal. Tendencias, alertas, recomendaciones priorizadas.
**Prioridad:** S | **Estimación:** L

#### HU-11.4 — Reporte de campañas
**Como** Marketing Manager
**Quiero** ver atribución de ventas a campañas/automatizaciones
**Para** medir ROI de marketing.
**Criterios:** Tracking por código promocional o por cookie. Atribución first-touch / last-touch configurable.
**Prioridad:** S | **Estimación:** L

#### HU-11.5 — Exportación de datos
**Como** Tenant Admin
**Quiero** exportar cualquier reporte a CSV/Excel
**Para** análisis en herramientas externas.
**Criterios:** Botón en cada reporte. Schedule export por email opcional.
**Prioridad:** S | **Estimación:** S

---

### 📦 ÉPICA 12 — Pagos y Facturación

#### HU-12.1 — Integración pasarelas LATAM
**Como** Manager
**Quiero** conectar Culqi/MercadoPago/Yape/Plin
**Para** cobrar en moneda local con métodos preferidos.
**Criterios:** Configuración por local. Comisiones visibles. Conciliación diaria.
**Prioridad:** M | **Estimación:** L

#### HU-12.2 — Boleta/Factura electrónica (LATAM)
**Como** Manager
**Quiero** emitir boleta o factura electrónica al cierre de cuenta
**Para** cumplir con SUNAT/DIAN/AFIP/SAT según país.
**Criterios:** Integración con OSE peruano (o equivalente por país). Captura RUC. Envío automático al email del cliente.
**Prioridad:** M | **Estimación:** XL

#### HU-12.3 — Facturación SaaS al tenant
**Como** Super Admin
**Quiero** cobrar mensualmente al tenant según plan + add-ons consumidos
**Para** monetizar la plataforma.
**Criterios:** Planes con límites (locales, mesas, envíos). Métricas de uso visibles. Cobro automático con tarjeta. Suspensión por morosidad.
**Prioridad:** M | **Estimación:** L

---

## 6. Roadmap Sugerido

### 🚀 MVP (Fase 1 — meses 1–4)
**Objetivo:** Tener 5 restaurantes piloto operando en Lima.
**Incluye:**
- Multitenant base + onboarding (Épica 1: HU-1.1 a 1.3, 1.5)
- Catálogo + menú + 86 (Épica 2: HU-2.1, 2.3, 2.6)
- QR ordering + carrito + tracking (Épica 3: HU-3.1 a 3.4, 3.7)
- Cola pedidos + KDS básico + dine-in/delivery distinción (Épica 4: HU-4.1 a 4.3, 4.5, 4.6)
- Reservas básicas + recordatorios (Épica 6: HU-6.1, 6.3, 6.4)
- Eventos: crear + landing AI básica + formulario + QR + email confirmación (Épica 7: HU-7.1 a 7.3, 7.5 a 7.7)
- CRM + leads + import CSV (Épica 8: HU-8.1, 8.2, 8.4)
- Comunicaciones: 1 canal WhatsApp (Evolution) + 1 email provider (Épica 9: HU-9.1, 9.4, 9.5)
- Automatizaciones plantilla (Épica 10: HU-10.2, 10.3)
- Dashboard básico (Épica 11: HU-11.1, 11.2)
- Pagos: 1 pasarela (Épica 12: HU-12.1)

### 📈 Fase 2 (meses 5–7)
- Floor plan + waitlist + depósitos (HU-6.2, 6.5, 6.6)
- WhatsApp Cloud API (HU-9.2)
- Builder de workflows visual (HU-10.1)
- Loyalty básico (HU-8.6)
- Boleta/factura electrónica (HU-12.2)
- Multi-idioma menú (HU-2.4)
- Pre-pago/split bill (HU-3.5, 3.6)
- Delivery con zonas y repartidores (HU-5.1 a 5.4)

### 🌟 Fase 3 (meses 8–12)
- Resúmenes AI ejecutivos (HU-11.3)
- Order throttling inteligente (HU-4.4)
- Atribución de campañas (HU-11.4)
- Check-in de eventos (HU-7.9)
- White-label con subdominios (HU-1.4 avanzado)
- Webhooks + API pública para integraciones

---

## 7. Consideraciones Técnicas

### 7.1 Stack sugerido (referencial)
- **Backend:** Node.js (NestJS) o Python (FastAPI) — multitenant con Postgres + tenant_id en cada tabla, Row-Level Security.
- **Frontend admin:** Next.js + TailwindCSS + shadcn/ui.
- **Frontend público (QR/landings):** Next.js con SSR para SEO de landings.
- **Real-time:** WebSockets (Socket.io) o Pusher para KDS y cola de pedidos.
- **DB:** PostgreSQL con réplicas de lectura para analítica. Redis para cache y colas.
- **Colas async:** BullMQ / Celery / Sidekiq para envíos masivos y procesamiento de imports.
- **Storage:** S3-compatible (Cloudflare R2 / AWS S3) para media de eventos.
- **AI:** Anthropic Claude API para generación de copy, landings, resúmenes; modelo de visión para procesar imágenes.
- **Hosting:** Vercel/Netlify (frontend) + Railway/Render/AWS (backend) + Cloudflare CDN.
- **Observabilidad:** Sentry + Posthog + Logtail.

### 7.2 Multitenant
- Modelo recomendado: **shared DB, shared schema con `tenant_id`**. Más simple, menos costoso, escalable. Postgres RLS para defensa en profundidad.
- Para clientes Enterprise: posibilidad de schema dedicado o instancia dedicada.

### 7.3 Compliance
- GDPR-ready desde día 1: consentimiento, derecho a borrado, exportación de datos.
- LATAM: Ley de Protección de Datos peruana (Ley 29733), LGPD Brasil.
- PCI DSS via tokenización con la pasarela (no almacenar tarjetas).
- Logs y auditoría con retención mínima 1 año.

### 7.4 Performance / SLA objetivo
- Carga del menú QR: <2s en 4G.
- Latencia KDS push: <500ms.
- Disponibilidad objetivo: 99.5% MVP, 99.9% Fase 3.
- Capacidad inicial: 100 tenants, 500 locales, 10k mesas, 100k pedidos/día.

### 7.5 Open questions / decisiones pendientes
1. ¿Apuntamos a Perú primero o LATAM amplio? Afecta priorización de pasarelas y facturación electrónica.
2. ¿Modelo de pricing freemium o trial-only? Afecta UX de onboarding.
3. ¿Construimos POS completo o nos integramos con uno existente? POS completo es 6+ meses de desarrollo.
4. ¿Mobile app nativa para staff o PWA es suficiente para MVP? Recomendación: PWA en MVP, app nativa Fase 3.
5. Estrategia de IA: ¿API directa de un LLM provider o fine-tunear nuestros propios prompts y guardrails? Recomendado: prompts curados con context injection del tenant.

---

## 8. Anexos

### 8.1 Glosario
- **Tenant:** Empresa cliente del SaaS.
- **Local:** Cada sucursal/punto de venta de un tenant.
- **KDS:** Kitchen Display System.
- **86 / Sistema 86:** Marcar un ítem como agotado.
- **WABA:** WhatsApp Business Account.
- **No-show:** Reserva que no se presenta.
- **Walk-in:** Cliente sin reserva que entra al local.

### 8.2 Métricas de éxito (North Star + supporting)
- **North Star:** Pedidos procesados/mes a través de la plataforma.
- **Supporting:** Tenants activos, tasa de retención mensual (>92% objetivo), NPS de tenants (>50), ARPU.

---

**Fin del documento.**
