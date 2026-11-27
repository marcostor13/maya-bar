# IA de la plataforma (HU85)

Cuenta de IA que usan **gratis** (sin descontar créditos) todas las empresas que no
conectaron su propia API key de IA. Solo con el modelo que elijas.

## Activarla

1. Entra como superadmin y abre **PLATAFORMA > IA de la plataforma** (`/admin/ai`).
2. Elige el proveedor y pega la API key. Conviene una key dedicada a Maya, con
   límite de gasto mensual configurado en la consola del proveedor.
3. Pulsa **Ver modelos** y elige uno rápido y barato para chat (p. ej.
   `claude-haiku-4-5`, `gpt-4o-mini` o `deepseek-v4-flash`). Con Gemini los
   agentes no usan herramientas (agenda, tienda, derivar a humano).
4. Pulsa **Probar**: debe decir "Conexión correcta".
5. Marca **Activar la IA de la plataforma** y **Guardar**. Se aplica en menos de 30 s.

## Qué cambia

- Empresas sin key propia: agentes, textos, puntaje de leads, prospección y
  recuperación usan tu cuenta y tu modelo, sin créditos. En Agentes IA > Avanzado
  ven el aviso "Tu empresa usa la IA de Maya".
- Empresas con alguna key propia: nada cambia.
- No cubre el agente de voz, la lectura de audios/imágenes ni la búsqueda en
  documentos (siguen con las keys del servidor).
- El consumo y su costo estimado siguen apareciendo por empresa en el panel de
  costos de IA (marcados como de plataforma).

## Desactivarla

Desmarca **Activar** y guarda: se vuelve a las keys del servidor con créditos.

## Cuidado

- No hay tope de gasto por empresa: vigila el costo en el panel y en la consola
  del proveedor.
- La key se cifra con `EMAIL_ENCRYPTION_KEY` (o `JWT_SECRET` si falta). Si cambias
  esa variable, vuelve a pegar la key: si no, la plataforma queda inactiva sin aviso.
