# HU85 — IA de la plataforma gratis · Especificación

Historia: `backlog/hu85-ia-de-la-plataforma.md` · Fecha: 2026-11-26 · Estado: cerrada

## Objetivo

Hoy una empresa sin API key propia usa las keys del servidor (`.env`) y cada
llamada descuenta créditos de IA de su plan (HU43). El superadmin quiere conectar
una cuenta de IA de la plataforma desde el panel, con un modelo fijo, para que
todas las empresas sin key propia usen la IA gratis (sin créditos).

## Usuarios

- Superadmin: configura proveedor, API key y modelo; lo activa o desactiva; prueba la conexión.
- Empresa sin key propia: su IA (agentes, textos, puntaje, prospección, recuperación) funciona sin gastar créditos.
- Empresa con key propia: nada cambia.

## Alcance

- Incluye: configuración en el panel de superadmin (`/admin/ai`), uso por defecto en
  `AiService.chat` y `AiService.chatMessages`, consumo medido sin créditos, aviso en
  la sección Avanzado del agente de IA.
- **Fuera de alcance:** agente de voz (OpenAI Realtime), embeddings y comprensión de
  audio/imágenes (`MediaUnderstandingService`): siguen con las keys de entorno y sus
  reglas actuales. Topes de consumo por empresa. Varias cuentas de plataforma.

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando el superadmin guarda proveedor, API key y modelo con la cuenta activada, el sistema debe guardarla y usarla desde ese momento.
- **R2** — Cuando una empresa sin ninguna API key propia (DeepSeek, Claude, OpenAI, Gemini) hace una llamada de chat de IA y la cuenta de plataforma está activa, el sistema debe usar el proveedor, la key y el modelo de la plataforma, ignorando el proveedor y modelo que pida el agente o la función.
- **R3** — Cuando una llamada usa la cuenta de la plataforma, el sistema no debe comprobar ni descontar créditos, y debe anotar el consumo (tokens, modelo, costo estimado) marcado como de plataforma.
- **R4** — Cuando la empresa tiene alguna API key propia, o la cuenta de plataforma está desactivada o sin configurar, el sistema debe comportarse como antes de HU85.
- **R5** — Cuando el superadmin pide los modelos de un proveedor, el sistema debe listarlos con la key escrita o la guardada (respaldo: catálogo).
- **R6** — Cuando el superadmin pulsa "Probar", el sistema debe hacer una llamada mínima con proveedor, key y modelo, y devolver éxito o el error del proveedor.
- **R7** — Cuando una empresa abre Avanzado de su agente y le aplica la cuenta de plataforma, la interfaz debe indicar que usa la IA de Maya con el modelo fijado, sin créditos.
- **R8** — Si se intenta activar sin proveedor, modelo o key, entonces el sistema debe rechazarlo con un mensaje claro.

No funcionales:
- **R9** — Seguridad: solo SUPERADMIN accede a `admin/platform-ai`; la key se guarda cifrada (AES-256-GCM, `SecretBox`) y nunca vuelve en respuestas ni en logs o auditoría (solo los últimos 4 caracteres).
- **R10** — Rendimiento: la configuración se lee con caché en memoria (≤ 30 s) para no consultar Mongo en cada mensaje; guardar invalida la caché.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R9 | Dado un superadmin, cuando guarda la cuenta, entonces se guarda cifrada y GET devuelve `keyHint` sin la key | unitaria `platform-ai.service.spec` |
| C2 | R9 | Dado un usuario que no es SUPERADMIN, cuando llama a `admin/platform-ai`, entonces 403 | unitaria del controlador |
| C3 | R2 | Dada la plataforma activa y una empresa sin keys, cuando `chatMessages` pide provider `openai` y modelo `x`, entonces se llama al proveedor y modelo de la plataforma con su key | unitaria `ai.service.platform.spec` |
| C4 | R2 | Igual con `chat()` | unitaria |
| C5 | R3 | Dada la plataforma activa, cuando se mide una llamada, entonces no se llama a `assertCanSpend` y `record` recibe `platform: true`; se anotan 0 créditos con costo estimado | unitarias AiService + AiCreditsService |
| C6 | R4 | Dada una empresa con key propia o la plataforma desactivada, entonces se usa el flujo anterior | unitaria |
| C7 | R8 | Dado activar sin key, entonces 400 | unitaria del servicio |
| C8 | R5, R6 | Listar modelos y probar usan la key escrita o la guardada | unitaria del servicio |
| C9 | R10 | Dos lecturas seguidas consultan Mongo una vez; tras guardar se relee | unitaria |
| C10 | R1, R5, R6 | Página `/admin/ai`: carga, guarda con toast, prueba, lista modelos; enlace en el menú del superadmin | unitaria frontend |
| C11 | R7 | Avanzado del agente muestra el aviso cuando aplica | unitaria frontend + backend |
| C12 | R2, R3 | La recuperación de clientes no exige créditos cuando aplica la plataforma | unitaria |
| C13 | — | **[usuario]** Configurar la cuenta real en producción y probar un agente de una empresa sin key | manual |

## Supuestos y decisiones por defecto

- "Key propia" = cualquiera de las 4 keys de IA guardadas por la empresa.
- Se admiten los 4 proveedores; con Gemini los agentes no usan herramientas (limitación existente), lo avisa la pantalla.
- `chat()` (textos de campañas, eventos, plantillas, puntaje) no recibe keys de empresa: las busca por `meter.tenantId`; con alguna propia no usa la plataforma.
- `hasAnyKey` pasa a ser async y cuenta la plataforma.
- La caché es por proceso (el backend corre en una sola instancia).

## Preguntas abiertas

- Ninguna (resueltas por el usuario: gratis sin créditos; key propia con modelo libre).
