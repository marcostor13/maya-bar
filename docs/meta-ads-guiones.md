# Meta Ads con video — plan y guiones (Maya CRM)

Reemplaza a las campañas con imagen y prueba gratis (borradas el 2026-11-26). Ya no hay
prueba gratis: el cliente ve una **demo en vivo** y paga en el checkout.

## 1. Plan

**Embudo:** anuncio en video (Reels, historias y feed) → botón "Enviar mensaje" → WhatsApp
991 172 822 → agente de IA de ventas (`docs/agente-ventas-maya.md`) califica y agenda la
demo → demo de 30 min con la cuenta demo (Clínica Dental Sonrisa, `/admin/tenants` >
"Crear / restablecer demo") → enlace de pago (Mercado Pago, tarjeta o Yape).

**Estructura en Ads Manager (cuenta "Maya CRM – PEN")**

| Nivel | Configuración |
|---|---|
| Campaña | `V-WhatsApp-Demo-PE` · Objetivo **Clientes potenciales** · Presupuesto de campaña Advantage+ **S/ 50/día** (subir 20 % cada 3–4 días si el costo por conversación calificada se mantiene) |
| Conjunto | `PE-Advantage-WA` · Lugar de conversión **WhatsApp** (991 172 822) · Público Advantage+ · Perú · 24–60 años · Ubicaciones Advantage+ |
| Anuncios | 5 videos (guiones 1–5) + variantes de gancho. Mismo texto base, cada uno con su `utm_content` en el nombre |
| Mensaje | Plantilla "Iniciar conversación" con mensaje predefinido **"Hola, quiero ver la demo de Maya CRM"**; sin saludo automático (lo da el agente) |

**Fases**

1. **Semana 1–2 (prueba de creatividades):** 5 videos a la vez; no tocar nada 5–7 días
   (fase de aprendizaje). Apagar el que tenga costo por conversación > 2× el promedio.
2. **Semana 3–4 (escala):** quedarse con los 2–3 mejores, grabar 2 ganchos nuevos de cada
   uno y subir el presupuesto 20 % cada 3–4 días.
3. **Mes 2:** campaña de remarketing (personas que vieron ≥ 50 % de un video o escribieron
   y no agendaron) con el guion 5 (objeciones), S/ 15/día.

**Medición (semanal, en el panel de Maya + Ads Manager)**

| Métrica | Dónde | Meta inicial |
|---|---|---|
| Costo por conversación iniciada | Ads Manager | referencia de la semana 1 |
| % de conversaciones calificadas (rubro + equipo de 2+) | Bandeja de Maya, etiqueta del agente | ≥ 40 % |
| Demos agendadas / conversaciones | Calendario / embudo | ≥ 20 % |
| Ventas / demos | Mercado Pago | ≥ 25 % |
| ThruPlay y retención a 3 s | Ads Manager | gancho que retiene ≥ 30 % |

Las metas son puntos de partida para comparar semanas, no promesas: se ajustan con los
datos de las primeras 2 semanas.

**Texto del anuncio (base para todos)**

- **Texto principal:** "¿Tu equipo responde WhatsApp desde varios celulares y se pierden clientes? Con Maya CRM todos atienden un solo número, cada chat tiene responsable y un agente de IA responde al instante con tus datos. Escríbenos y te mostramos la demo en vivo."
- **Texto 2:** "Desde S/ 99 al mes + IGV. Bandeja compartida de WhatsApp, agente de IA, embudo de ventas y campañas. Pide tu demo por WhatsApp."
- **Título:** "Mira la demo de Maya CRM" · **Título 2:** "Tu equipo en un solo WhatsApp"
- **Botón:** Enviar mensaje de WhatsApp

**Reglas de producción**

- 9:16, 1080×1920, 20–35 s. Debe entenderse sin sonido: subtítulos quemados, grandes, con
  fondo, dentro de la zona segura (libres ~250 px arriba y ~350 px abajo).
- Gancho en el primer segundo, sin logo al inicio. Corte cada 2–3 s.
- Pantallas grabadas **solo con la cuenta demo** (datos ficticios). Nunca con cuentas de
  clientes. Grabar con la grabación de pantalla del navegador o del celular, revisando cada
  toma antes de publicar.
- Nada de cifras de resultados que no podamos demostrar ni testimonios inventados. No
  mencionar prueba gratis.
- Si la voz o alguna imagen se genera con IA, declararlo al crear el anuncio.
- Nombre de archivo = nombre del anuncio: `v1-11pm-a.mp4`, `v1-11pm-b.mp4` (variante de gancho).

---

## 2. Guiones

### Guion 1 — "El cliente de las 11 p. m." (a cámara + pantalla) · 30 s

**Ángulo:** ventas perdidas por responder tarde. **Quién:** el fundador o un vendedor, con el
celular en la mano, luz natural, tono de conversación.

| Tiempo | Imagen | Voz | Texto en pantalla |
|---|---|---|---|
| 0–2 s | Primer plano del celular: 11:07 p. m., chat sin responder "¿Precio? ¿Tienen hoy?" | "Este cliente escribió a las once de la noche…" | **Te escribió a las 11 p. m.** |
| 2–5 s | Gira el celular hacia cámara. | "…le respondimos al día siguiente. Ya le había comprado a otro." | **Respondiste al día siguiente** |
| 5–14 s | Pantalla de la demo: llega un mensaje y el agente de IA responde precio y agenda la cita. | "Ahora un agente de IA responde al instante, con nuestros precios, a cualquier hora." | **La IA responde al instante, con tus datos** |
| 14–22 s | Bandeja compartida: el chat aparece con responsable y etapa; un vendedor lo toma. | "Y cuando el cliente está listo, lo toma alguien del equipo. Todos desde un solo número." | **Todo tu equipo, un solo WhatsApp** |
| 22–30 s | A cámara, luego placa final con logo y "Desde S/ 99/mes + IGV". | "Se llama Maya CRM. Escríbenos y te mostramos la demo en vivo." | **Pide tu demo por WhatsApp 👇** |

Ganchos alternativos (0–2 s): "¿Cuántas ventas pierdes por responder tarde?" · "Mi WhatsApp era un caos hasta que…"

### Guion 2 — "3 cosas que hace Maya en tu WhatsApp" (solo pantalla) · 25 s

**Ángulo:** mostrar el producto rápido. **Para:** quien ya compara CRMs. Sin persona a cámara.

| Tiempo | Imagen | Texto en pantalla / voz |
|---|---|---|
| 0–2 s | WhatsApp con decenas de chats sin leer (zoom). | **¿Tu WhatsApp se ve así?** |
| 2–4 s | Corte a la bandeja de la demo, ordenada. | **Mira esto** |
| 4–10 s | Bandeja: varios vendedores, cada chat con responsable y nota. | **1 · Todo el equipo en un solo número** |
| 10–16 s | El agente de IA responde una pregunta de precio. | **2 · IA que responde con tus datos, 24/7** |
| 16–21 s | Embudo de ventas: arrastrar una oportunidad a "Ganado". | **3 · Sabes qué cliente está por cerrar** |
| 21–25 s | Placa final. | **Maya CRM · Desde S/ 99/mes + IGV · Pide tu demo** |

### Guion 3 — "Un día en la clínica" (caso de rubro, pantalla + voz en off) · 30 s

**Ángulo:** que el dueño de un negocio de servicios se vea reflejado. Usa la cuenta demo
tal cual (Clínica Dental Sonrisa). Se pueden grabar versiones para otros rubros cambiando
solo la voz y los textos.

| Tiempo | Imagen | Voz en off | Texto en pantalla |
|---|---|---|---|
| 0–3 s | Bandeja con 3 mensajes nuevos llegando a la vez. | "Lunes, 9 de la mañana. Tres pacientes escriben al mismo tiempo." | **3 mensajes a la vez** |
| 3–10 s | El agente responde al de blanqueamiento y agenda la cita. | "Uno pregunta el precio del blanqueamiento: la IA responde y le agenda la cita." | **Cita agendada sola** |
| 10–17 s | Chat de ortodoncia marcado como "derivado", lo toma Diego. | "Otro quiere pagar en cuotas: la IA se lo pasa a Diego, que cierra la venta." | **La IA sabe cuándo pasar el chat** |
| 17–24 s | Embudo con oportunidades y montos por etapa. | "Y al final del día, ves cuánto vas a vender esta semana." | **Tu embudo, claro** |
| 24–30 s | Placa final. | "Maya CRM. Escríbenos y te mostramos esta demo en vivo." | **Pide tu demo por WhatsApp** |

### Guion 4 — "El dueño que no sabe quién respondió" (problema → solución, a cámara) · 25 s

**Ángulo:** control del equipo. **Para:** dueños o jefes de ventas con 3+ vendedores.

| Tiempo | Imagen | Voz | Texto en pantalla |
|---|---|---|---|
| 0–2 s | Persona frente a 3 celulares sobre la mesa. | "¿Quién le respondió a este cliente?" | **¿Quién le respondió?** |
| 2–6 s | Se encoge de hombros. | "Si tu equipo vende por WhatsApp desde varios celulares, no lo sabes." | **Varios celulares = cero control** |
| 6–16 s | Pantalla: cada chat con responsable, notas internas y etapa; filtro por vendedor. | "Con Maya CRM ves cada conversación, quién la atiende y en qué etapa está." | **Cada chat con responsable** |
| 16–21 s | Reporte de oportunidades por vendedor. | "Y sabes quién vende más." | **Reportes por vendedor** |
| 21–25 s | Placa final. | "Pide tu demo por WhatsApp." | **Maya CRM · Pide tu demo** |

### Guion 5 — "Lo que me preguntan antes de comprar" (objeciones, a cámara) · 35 s · remarketing

**Ángulo:** resolver dudas de quien ya vio un anuncio. Persona del equipo, tono cercano.

| Tiempo | Imagen | Voz | Texto en pantalla |
|---|---|---|---|
| 0–3 s | A cámara. | "Las 3 preguntas que nos hacen antes de contratar Maya CRM." | **3 dudas antes de contratar** |
| 3–12 s | A cámara + logo de Meta. | "Uno: ¿me pueden bloquear el número? No: usamos la API oficial de WhatsApp de Meta." | **1 · API oficial de Meta** |
| 12–22 s | Pantalla de la configuración del agente. | "Dos: ¿la IA va a inventar cosas? Responde solo con la información que tú le cargas, y te pasa el chat cuando no sabe." | **2 · Responde con tus datos** |
| 22–30 s | Pantalla de precios. | "Tres: ¿cuánto cuesta? Desde 99 soles al mes más IGV, con boleta o factura." | **3 · Desde S/ 99/mes + IGV** |
| 30–35 s | A cámara. | "¿Más dudas? Escríbenos y te mostramos la demo." | **Pide tu demo por WhatsApp** |

---

## 3. Lo que necesito de ti

1. Grabar los guiones 1, 4 y 5 a cámara (2–3 ganchos de cada uno). Los guiones 2 y 3 se
   arman solo con grabaciones de pantalla de la cuenta demo.
2. Restablecer la demo antes de grabar (Empresas > "Crear / restablecer demo").
3. Editar en CapCut (subtítulos automáticos revisados a mano, música con licencia).
4. Pasarme los videos: subo los anuncios a Ads Manager como **borradores** y tú publicas.
