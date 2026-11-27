# HU88 — Cuenta demo de solo lectura · Spec

## Requisitos
- R1. Cualquier escritura (POST, PUT, PATCH, DELETE) de un usuario de la empresa demo
  (`tenant.demo === true`) se rechaza con 403 `{ code: 'DEMO_READ_ONLY' }` y un mensaje
  claro, también en rutas que la solo lectura por cobro deja abiertas (`/auth/change-password`,
  `/users/me`, `/tenants/me`, `/billing`, `/push`, `/notifications`).
- R2. Lecturas (GET/HEAD/OPTIONS) siguen igual: el usuario ve todo.
- R3. Siguen funcionando: iniciar sesión, renovar la sesión (`/auth/refresh`) y cerrar
  sesión (`/auth/logout`).
- R4. El superadmin no se ve afectado: puede restablecer la demo (HU86).
- R5. `/billing/status` informa `demo: true` y el shell muestra un aviso "cuenta demo: solo
  lectura" sin botones de pago.
- R6. Las empresas no demo no cambian.
- R7. El prompt del agente de ventas deja de pedir "no cambies la contraseña" y explica que
  la demo es solo para mirar.

## Criterios de aceptación
- C1. e2e: con el usuario demo, crear contacto → 403 DEMO_READ_ONLY y no se crea.
- C2. e2e: con el usuario demo, `PATCH /auth/change-password` y `PATCH /users/me` → 403; la
  contraseña sigue sirviendo para entrar.
- C3. e2e: con el usuario demo, `GET /contacts` → 200 con datos.
- C4. e2e: el superadmin restablece la demo con éxito tras C1–C3.
- C5. e2e: otra empresa crea un contacto normalmente.
- C6. Unitaria del interceptor: demo + POST en ruta normal y en ruta siempre permitida → 403;
  `/auth/logout` y `/auth/refresh` pasan; GET pasa; superadmin pasa.
- C7. Frontend: el banner muestra el aviso de demo y no muestra "Elegir plan".
- C8. Build y suites completas en verde.
