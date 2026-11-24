# HU65 — Integración con Zapier y Make

## Historia

**Como** cliente que usa otras herramientas (Sheets, su ERP, su tienda),
**quiero** conectar Maya con Zapier o Make sin programar,
**para** mover datos entre sistemas.

## Contexto (estado actual)

- Ya existe la API de integraciones con claves por empresa (`api-access`):
  - Envío de WhatsApp y SMS (HU13, HU14).
  - Webhook de salida (HU15).
- No hay apps publicadas en Zapier ni en Make.

## Propuesta

1. Completar la API pública para lo que piden estas plataformas:
   - Crear y actualizar contactos, crear oportunidades, añadir etiquetas y listar.
   - Suscripciones REST a webhooks (REST hooks: `subscribe` y `unsubscribe`) para los disparadores.
2. **Disparadores**: contacto nuevo, formulario enviado, oportunidad cambia de etapa, mensaje entrante y registro a evento.
3. **Acciones**: crear o actualizar contacto, crear oportunidad, enviar WhatsApp (plantilla) y añadir etiqueta.
4. App privada de Zapier (CLI) y app de Make con autenticación por clave de API. Documentación pública de la API (OpenAPI).
5. **[usuario]** Cuentas de desarrollador de Zapier y Make para publicarlas.

## Criterios de aceptación (borrador)

- C1: `POST /api/v1/hooks` registra una URL y, al llegar un contacto nuevo, la llama con la carga documentada.
- C2: la especificación OpenAPI se genera y pasa la validación.
