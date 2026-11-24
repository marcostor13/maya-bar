# HU42 — Límites por plan aplicados

## Historia

**Como** dueño de Maya,
**quiero** que cada plan limite de verdad usuarios, números, contactos y lo demás,
**para** que los planes se diferencien y el cliente que crece pase al siguiente.

## Contexto (estado actual)

- No existe ningún límite: cualquier empresa crea usuarios, cuentas de WhatsApp, agentes IA, buzones y eventos sin tope.
- Los módulos se filtran por permisos (`backend/src/roles/modules.catalog.ts`, `HIDDEN_MODULES`), no por plan.

## Propuesta

1. `PlanLimitsService.check(tenantId, recurso)`:
   - Cuenta el uso actual contra el límite del plan (HU40) más los add-ons comprados (HU53).
   - Recursos: usuarios, números de WhatsApp, buzones, agentes IA, eventos publicados, contactos y emails de campaña del mes.
2. Guard o llamada en los `create` de esos módulos. Si se supera el límite, devuelve **402** con el código `PLAN_LIMIT` y el recurso afectado.
3. **Funciones por plan** (`features`) aplicadas en el backend y ocultas o con candado en el menú:
   - Las campañas masivas de WhatsApp, desde Crece.
   - La recuperación de clientes y la multi-sede, desde Escala.
   - La prospección, en todos los planes, pero consume créditos (HU43).
4. Inicia: **1 evento publicado a la vez**. Crece en adelante: sin límite de eventos.
5. Frontend: al topar un límite, un aviso con "Mejorar plan" o "Comprar add-on", nunca un error genérico.
6. Las empresas `legacy` (HU40) quedan exentas.

## Fuera de alcance

- Borrar datos al bajar de plan: lo que sobra queda en solo lectura (HU52).

## Criterios de aceptación (borrador)

- C1: en Inicia, crear el 3.er usuario devuelve 402 `PLAN_LIMIT` y la UI ofrece mejorar el plan o comprar un usuario extra.
- C2: en Inicia, publicar un 2.º evento devuelve 402; guardarlo como borrador sí funciona.
- C3: con un add-on de +1 usuario, el 3.er usuario se crea.
- C4: una empresa `legacy` no tiene límites.
