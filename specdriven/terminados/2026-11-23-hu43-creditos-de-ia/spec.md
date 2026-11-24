# HU43 — Créditos de IA medidos · Especificación

Historia: `backlog/hu43-creditos-de-ia.md` · Fecha: 2026-11-23 · Estado: aprobada

## Objetivo

Medir en créditos todo lo que gasta IA cada empresa, para proteger el margen y vender recargas.

## Usuarios

- Dueño de Maya: ve consumo y costo por empresa.
- Empresa: sabe su saldo; con sus propias API keys no gasta créditos.

## Alcance

- Incluye: colección `usage_ledger`; tabla de créditos por acción; medición central en
  `AiService` (opción `meter: { tenantId, action }`); tokens y modelo desde la respuesta del
  proveedor; saldo = créditos del plan del mes + recargas vigentes − consumo; BYOK registra sin
  descontar; sin saldo → 402 `AI_CREDITS` y, en el agente, derivación a humano con la nota
  "Sin créditos de IA"; `GET /billing/credits`.
- Acciones medidas: respuesta del agente (1), recuperación por conversación (3), empresa
  investigada en prospección (10), texto generado en campañas, plantillas y eventos (1).
- **Fuera de alcance:** comprar recargas (HU53); avisos 80 %/100 % por correo (HU50); medios
  (voz/imagen) — `media-understanding` usa su propio transporte y queda para una iteración
  posterior; asistentes internos de prompts (`agent-generator`, `prompt-review`) quedan sin medir.

## Requisitos (EARS)

- **R1** — Cuando una llamada medida termina, el sistema debe guardar en `usage_ledger` tenantId, periodo `AAAA-MM`, acción, créditos, tokens de entrada/salida, modelo, proveedor y si fue BYOK.
- **R2** — Si la llamada usa la API key propia de la empresa, entonces se registra con `credits: 0` y `byok: true` y no se comprueba saldo.
- **R3** — Si el saldo no alcanza antes de una llamada medida, entonces el sistema debe responder 402 `AI_CREDITS` sin llamar al proveedor.
- **R4** — Cuando el agente no puede responder por falta de créditos, el sistema debe pasar la conversación a humano y dejar la nota interna "Sin créditos de IA".
- **R5** — El saldo usa primero los créditos del plan del mes (no se acumulan) y después las recargas (`tenant.aiCreditsPurchased`, vencen a los 12 meses).
- **R6** — `legacy` y Empresa registran consumo pero nunca se bloquean.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Una respuesta del agente deja un registro de 1 crédito con tokens y modelo | unitaria `ai.service.spec.ts` + `ai-credits.service.spec.ts` |
| C2 | R2 | Con key propia → registro `byok`, 0 créditos, sin comprobar saldo | unitaria |
| C3 | R3, R4 | Sin saldo → el agente no responde, conversación a humano con "Sin créditos de IA" | unitaria `conversations.email.spec.ts` |
| C4 | R5 | Consumo del plan agotado descuenta recargas; recarga vencida no cuenta | unitaria |

## Supuestos y decisiones por defecto

- El periodo es el mes UTC.
- Costo US$ estimado: no se calcula (no hay tabla de precios por modelo fiable); se guardan los tokens.

## Preguntas abiertas

- Ninguna.
