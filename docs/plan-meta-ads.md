# Plan Meta Ads — Maya CRM

Fecha: 2026-11-25 · Estado: en ejecución (HU84 hecha; ver "Estado" al final)

## 1. Diagnóstico

### Cuenta de Meta (portafolio "Maya IA", verificado)
| Activo | Estado | Acción |
|---|---|---|
| Página de Facebook | Solo existe "Ignia". "Maya CRM" está en creación y falta aceptar las condiciones | El usuario acepta y crea |
| Instagram | No hay ninguna cuenta en el portafolio | Crear @mayacrm (o similar) y conectarla a la página |
| Cuenta publicitaria | "IGNIA Web USA" desactivada por el método de pago | Crear "Maya CRM – PEN" con zona horaria de Lima y tarjeta del usuario |
| Conjunto de datos (píxel) | Ninguno | Crear "Maya CRM – Web" |
| Dominio | No verificado en Meta | Verificar `mayacrm.site` con una meta etiqueta |
| WhatsApp | Hay cuentas de WhatsApp en el portafolio | Vincular un número a la página para anuncios de clic a WhatsApp |

Las otras cuentas publicitarias a las que tienes acceso (Farmacenter y una cuenta personal desactivada) son de otros negocios. No se usan.

### Web (mayacrm.site)
- No tiene píxel, API de conversiones, captura de UTM/`fbclid` ni banner de consentimiento. Hoy ningún anuncio podría optimizarse por registros ni por pagos.
- A favor:
  - Landing rápida y prerenderizada, con precios publicados y prueba de 14 días.
  - Botón a WhatsApp.
  - Páginas por industria y comparativas, que sirven como destino por segmento.
  - Registro con verificación de correo y pago con Mercado Pago. Son eventos claros del embudo.

## 2. Embudo y eventos

| Paso | Evento de Meta | Dónde se dispara | Por dónde se envía |
|---|---|---|---|
| Visita | `PageView` | Todas las páginas públicas | Píxel |
| Ver precios | `ViewContent` | Sección o página de precios | Píxel |
| Clic a WhatsApp | `Contact` | Botón "Escribir por WhatsApp" | Píxel + CAPI |
| Registro verificado | `CompleteRegistration` | Backend, al verificar el correo | CAPI + píxel con el mismo `event_id` |
| Empresa creada | `StartTrial` (valor previsto) | Backend, fin del onboarding | CAPI |
| Pago | `Purchase` (valor real, PEN o USD) | Webhook o conciliación de Mercado Pago | CAPI |
| Lead calificado en WhatsApp | `LeadSubmitted` / `QualifiedLead` | CRM de Maya, al mover la etapa | CAPI para mensajería empresarial (`action_source: business_messaging`) |

Requisitos técnicos (una HU):
- Píxel con consentimiento previo. Ley 29733: banner con "Aceptar" o "Solo necesarias"; sin aceptación no se carga.
- CAPI desde el backend con correo, teléfono, `fbp`, `fbc`, IP y user agent con hash SHA-256, y deduplicación por `event_id`. Objetivo: calidad de coincidencia (EMQ) de 8 o más.
- Guardar UTM, `fbclid` y `fbc` en la empresa al registrarse, para atribuir pagos que llegan días después.
- Meta etiqueta de verificación de dominio.
- Actualizar la política de privacidad para mencionar el píxel y la CAPI.

## 3. Estrategia de campañas (prácticas actuales)

Con el sistema actual de entrega de Meta (Andromeda), **la variedad creativa reemplaza a la segmentación**: público amplio, pocas campañas con presupuesto concentrado y muchos conceptos distintos. Hacer microsegmentos por intereses no sirve.

**Campaña A — Clic a WhatsApp (principal).** Así se usa el propio producto: el anuncio abre WhatsApp, el agente de IA de Maya responde al instante y el vendedor cierra.
- Objetivo: Ventas o Clientes potenciales, con destino WhatsApp. Al inicio se optimiza por conversaciones; con la CAPI de mensajería se pasa a optimizar por lead calificado.
- Las conversaciones que empiezan desde el anuncio tienen ventana gratuita de mensajes.

**Campaña B — Registro de prueba (web).**
- Objetivo: Clientes potenciales o Ventas con conversión en el sitio.
- Optimización: primero `CompleteRegistration` (tiene volumen); cuando haya unos 50 eventos por semana, `StartTrial` o `Purchase` con valor.
- Destino: landing; por industria, `/industrias/*`.

**Remarketing:** no va en campaña aparte al inicio. Advantage+ ya incluye a quien visitó o conversó. Se excluyen los clientes que ya pagan con un público personalizado del CRM.

**Configuración común:**
- Público Advantage+ amplio en Perú, más adelante LatAm. Sugerencias de edad 25–55 y "dueños de negocio / ventas" solo como señal.
- Ubicaciones Advantage+.
- Presupuesto en la campaña (CBO).
- Presupuesto inicial sugerido: S/ 40–60 al día por campaña. No tocar nada durante 7 días, salvo pausar anuncios con CPA mayor a 3 veces el objetivo.

**Creatividades (lo que más mueve el resultado):**
- 8 a 12 conceptos distintos de entrada, no variaciones del mismo.
- Formatos: Reels 9:16 (prioridad), 4:5 y 1:1. Texto legible sin sonido y gancho en el primer segundo.
- Ángulos:
  1. "Se te pierden clientes en WhatsApp": el dolor y la bandeja compartida.
  2. "Tu IA responde a las 11 p. m.": el agente de IA, con una demo real en pantalla.
  3. "Todo tu equipo en un solo número": varios vendedores.
  4. "Pagas por equipo, no por usuario": precio frente a Kommo o HubSpot, con los datos de las comparativas.
  5. "Del formulario al WhatsApp en segundos": captación.
  6. "Tu evento lleno y con check-in": productoras y academias.
  7. Industria: inmobiliarias, clínicas, academias.
  8. Fundador a cámara: quién está detrás y por qué.
- Grabaciones reales de la plataforma con datos de demostración, nunca de clientes. Además, UGC o video del fundador.
- No inventar testimonios ni cifras.
- Cada 2–3 semanas entran 3–5 conceptos nuevos y se retiran los que llevan más de 14 días con frecuencia mayor a 3 y CTR en caída.

**Medición:**
- Revisión semanal de CPA por registro, costo por conversación, costo por pago y ROAS a 30 días (con la atribución propia de Maya por `fbc`).
- Pruebas A/B de Meta solo para decisiones grandes: oferta o landing.

## 4. Página e Instagram (contenido orgánico de base)
- Foto de perfil: logo. Portada: 1640×624 con propuesta y "Prueba 14 días".
- Botón "Enviar mensaje de WhatsApp". Sitio web, horario y ubicación (Lima).
- Primeras 9 publicaciones antes de lanzar anuncios, porque dan confianza a quien entra al perfil:
  - 3 de producto: bandeja, IA, campañas.
  - 2 educativas: costo de WhatsApp en Perú; WhatsApp Business frente a la API.
  - 1 de precios.
  - 1 comparativa.
  - 1 de industria.
  - 1 del fundador.
- Instagram con la misma biografía, enlace a la web y destacados: Qué es, Precios, IA, Casos.

## 5. Orden de ejecución
1. Usuario: crear la página (aceptar condiciones) y la cuenta de Instagram.
2. Claude: completar la página (foto, portada, botón, datos) y conectar Instagram al portafolio.
3. Usuario aprueba y Claude crea la cuenta publicitaria y el conjunto de datos. El usuario agrega la tarjeta.
4. Claude: HU de píxel, CAPI, consentimiento, UTM y dominio. Prueba con "Probar eventos" y verificación de EMQ.
5. Claude: 9 publicaciones orgánicas (texto e imágenes). El usuario aprueba antes de publicar.
6. Claude: piezas y textos de anuncios. El usuario graba 2–3 videos (fundador y pantalla).
7. Claude: arma las campañas A y B en pausa. El usuario revisa y las activa.

## Estado (2026-11-25)
- Hecho:
  - Página "Maya CRM" con foto, portada, enlace y área.
  - Instagram @mayacrmperu en el portafolio, con foto y presentación.
  - Dominio mayacrm.site agregado, con la meta etiqueta lista.
  - HU84 de medición implementada.
  - Contenido inicial en `docs/meta-ads-contenido.md`.
- Falta del usuario:
  - Crear la cuenta publicitaria y la tarjeta.
  - Terminar el login de Instagram para vincularlo a la página.
  - Elegir el número de WhatsApp: el 991 172 822 no está en el portafolio.
  - Aprobar las publicaciones.
- Después: crear el píxel, poner su id y las variables `META_*`, verificar el dominio y armar las campañas A y B en pausa.
