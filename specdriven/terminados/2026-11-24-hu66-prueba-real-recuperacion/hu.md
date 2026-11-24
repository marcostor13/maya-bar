# HU66 — Prueba real de recuperación, SMS y email antes de venderlos

## Historia

**Como** dueño de Maya,
**quiero** probar con cuentas reales el asistente de recuperación, las campañas de SMS y email y los dominios cortos,
**para** venderlos en el plan Escala sabiendo que funcionan.

## Contexto (estado actual)

- Ver las memorias `recovery_wizard` y `campaigns_links_plan`. Están implementados con builds y pruebas unitarias, pero **sin prueba de extremo a extremo** contra Meta, Resend, el proveedor de SMS ni un dominio corto en producción.
- El benchmark recomienda venderlos como servicio ("Recuperación llave en mano S/ 690") hasta validarlos.

## Propuesta

1. Guion de prueba manual con una cuenta Cloud API de pruebas y una empresa interna:
   - Recuperación: análisis → plantillas creadas en Meta → aprobación → envío por tandas → respuestas en la bandeja → reanudación tras reiniciar el backend.
   - Campaña de email con dominio propio (DKIM/SPF), con entrega, baja y clic.
   - Campaña de SMS con el proveedor configurado.
   - Link corto con dominio propio: redirección y conteo de clics.
2. Corregir lo que falle, con una prueba automática por cada fallo encontrado.
3. Medir el costo real de IA por conversación analizada, para fijar los créditos de HU43.
4. Resultado documentado en `docs/` y la decisión de mover la recuperación al plan Escala (HU56).

## Criterios de aceptación (borrador)

- C1 **[usuario]**: una campaña de recuperación real envía al menos 20 mensajes y las respuestas aparecen en la bandeja.
- C2: un reinicio del backend durante el análisis no pierde lo ya clasificado.
- C3 **[usuario]**: un email de campaña llega a Gmail en la bandeja principal con DKIM válido.
