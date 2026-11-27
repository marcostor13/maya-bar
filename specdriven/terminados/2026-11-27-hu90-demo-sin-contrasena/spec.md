# HU90 — Demo sin contraseña · Spec

## Criterios
- C1: `POST /auth/demo` (público, sin cuerpo) abre sesión (access + refresh token) con el usuario principal de la empresa demo.
- C2: esa sesión es de solo lectura (HU88): ve los datos, toda escritura da 403 `DEMO_READ_ONLY`; puede renovar la sesión.
- C3: si la empresa del correo demo no está marcada `demo: true` (o está suspendida o no existe), responde 404 y no entrega tokens.
- C4: `https://mayacrm.site/demo` abre la sesión sola y lleva al dashboard; si falla, avisa con toast y deja reintentar. No pide contraseña.
- C5: límite de 10 entradas por minuto por IP; cada entrada queda en la bitácora de accesos (método `demo`).
- C6: el prompt de ventas entrega el enlace `/demo` y nunca usuario ni contraseña; restablecer la demo no obliga a tocar el prompt.

## Fuera de alcance
- Botón "Ver demo" en la landing (contenido público: decidirlo con el usuario).
