# Prueba real: recuperación, SMS, email y links cortos (HU66)

Objetivo: validar con cuentas reales antes de vender estas funciones en el plan Escala (HU56).

**Dónde:** una empresa interna (p. ej. "Maya QA") en producción.

**Qué hace falta:**
- Un número de WhatsApp Cloud API de pruebas.
- Un dominio propio para correo y otro para los links.
- El proveedor de SMS configurado.

Anota el resultado de cada paso en la tabla del final. Por cada fallo:
- Abre una historia o un arreglo.
- Añade una prueba automática que lo reproduzca.

## 0. Preparación
- [ ] Empresa interna con plan Escala (o con los módulos activados por el superadmin).
- [ ] WhatsApp Cloud API conectado (Configuración → WhatsApp), con al menos 25 conversaciones reales de los últimos 30 días. Pueden ser de números del equipo.
- [ ] Una DeepSeek API key propia en Ajustes → IA, o créditos de IA disponibles.
- [ ] Resend con dominio propio verificado (DKIM y SPF en verde en Resend) y webhook de aperturas activo (HU61).
- [ ] Proveedor SMS configurado (Ajustes → SMS) y con saldo.
- [ ] Dominio corto propio apuntando al backend (Ajustes → Links).

## 1. Recuperación de clientes (C1, C2)
1. Recuperación → Nuevo plan, 30 días. Anota la hora de inicio.
2. **Reinicio durante el análisis (C2):**
   - Cuando la barra muestre avance (más de 15 procesadas), reinicia el backend: en Coolify, Restart.
   - Al volver, el análisis debe seguir desde donde iba: el número de procesadas no vuelve a 0.
   - Cubierto también por `test/recovery-resume.e2e-spec.ts`.
3. Revisa los segmentos y edita un mensaje con "Reescribir".
4. Crea las plantillas: deben aparecer en Meta (WhatsApp Manager → Plantillas) como "En revisión" y luego "Aprobadas". Anota cuánto tardó la aprobación.
5. Programa el envío por tandas con al menos 20 destinatarios (C1).
6. Durante el envío, reinicia el backend otra vez. No debe duplicar mensajes y debe retomar la tanda.
7. Responde desde 2 o 3 teléfonos: las respuestas deben aparecer en la Bandeja dentro de la misma conversación.
8. Abre la ficha del plan: los envíos marcados como enviados, entregados o leídos deben coincidir con lo que se ve en WhatsApp.

## 2. Campaña de email (C3)
1. Campañas → Nueva → Email, a una lista de 5 buzones del equipo: Gmail, Outlook y uno corporativo.
2. En Gmail, el correo debe llegar a **Principal** (no a Promociones ni a Spam). En "Mostrar original" deben verse `DKIM: PASS` y `SPF: PASS` con el dominio propio.
3. Abre un correo y haz clic en el link: la ficha del contacto y la campaña deben marcar la apertura y el clic (HU61).
4. Pulsa "Darse de baja": el contacto pasa a "No contactar" y una segunda campaña ya no le llega.

## 3. Campaña de SMS
1. Campañas → Nueva → SMS a 3 teléfonos del equipo, con variable `{{nombre}}` y un link corto.
2. Deben llegar los 3 con el nombre bien puesto. El estado por destinatario debe pasar a "enviado" y, si el proveedor lo informa, a "entregado".
3. Un número en "No contactar" no debe recibirlo.

## 4. Link corto con dominio propio
1. Crea un link en Links con el dominio propio y ábrelo desde el móvil y desde el ordenador.
2. Debe redirigir con 302 al destino y sumar 2 clics. El clic de un contacto conocido debe aparecer en su ficha.

## 5. Costo real de IA
- Tras el análisis, el superadmin consulta:
  `GET /billing/admin/ai-usage/by-action?period=AAAA-MM`
  con `Authorization: Bearer <token de superadmin>`.
- La fila `recovery` da el costo por conversación analizada en `costPerUnitUsd`, junto con las llamadas, las conversaciones y los tokens. Con key propia (BYOK) no se cuenta: hacer la prueba con créditos de la plataforma.
- Hoy la recuperación cobra **3 créditos por conversación** (`CREDIT_COSTS.recovery`). Si `costPerUnitUsd` × 1,3 supera el valor de 3 créditos según el precio de la recarga, hay que subir el costo en créditos.

## 6. Resultado y decisión
| Paso | Resultado | Fecha | Notas / historia de arreglo |
|---|---|---|---|
| 1. Recuperación (≥ 20 envíos, respuestas en bandeja) | | | |
| 1.2 Reinicio durante el análisis | | | |
| 1.6 Reinicio durante el envío | | | |
| 2. Email en Principal con DKIM | | | |
| 2.3 Aperturas y clics | | | |
| 2.4 Baja | | | |
| 3. SMS | | | |
| 4. Link corto propio | | | |
| 5. Costo por conversación (US$) | | | |

**Decisión:** si los pasos 1, 2 y 4 salen bien, la recuperación pasa al plan Escala (HU56). Mientras tanto se vende como servicio ("Recuperación llave en mano").
