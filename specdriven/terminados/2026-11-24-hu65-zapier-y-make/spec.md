# HU65 — Integración con Zapier y Make · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada

## Objetivo
Conectar Maya con Zapier o Make sin programar para mover datos entre sistemas.

## Alcance
- **Incluye:**
  - **Claves.** Tipo de clave "Automatización", sin dominio y con IP opcional.
  - **API del CRM** (`/api/v1`): probar la clave (`me`); contactos (listar, buscar, ver, crear o actualizar por email o teléfono, editar, añadir etiquetas); oportunidades (listar, crear); envío de plantilla de WhatsApp.
  - **REST hooks** (suscribir, desuscribir, listar, ejemplo) para cinco disparadores: contacto nuevo, formulario enviado, cambio de etapa, mensaje entrante y registro a evento. Van firmados con HMAC y un 410 borra la suscripción.
  - **Documentación:** OpenAPI 3.0 pública en `/api/v1/openapi.json`.
  - **Apps:** app de Zapier (CLI) y definición de la app de Make en `integrations/`.
- **Fuera de alcance:** publicar las apps en los directorios públicos de Zapier y Make, porque requiere las cuentas de desarrollador del usuario.

## Requisitos (EARS)
- **R1** — Cuando ocurre un disparador, el sistema debe llamar a cada URL suscrita de esa empresa con la carga documentada y firmada.
- **R2** — Mientras la clave no sea de tipo automatización o esté revocada, el sistema rechaza la API del CRM.
- **R3** — El sistema debe publicar una especificación OpenAPI válida y coherente con las respuestas.

## Criterios de aceptación
| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | `POST /api/v1/hooks` registra una URL y, al llegar un contacto nuevo, la llama con la carga documentada | e2e |
| C2 | R3 | La especificación OpenAPI se genera y pasa la validación | e2e |
