# HU89 · Plan
- `backend/src/demo/demo-extra.ts`: `buildDemoExtras(base, now)` devuelve `{model, docs}[]`
  y completa contactos (puntaje, formulario) y conversaciones (canales, campaña del anuncio).
- `demo-data.ts` lo llama y devuelve `extras`; `demo.service.ts` los inserta con el modelo
  registrado (`connection.models[model]`), validando como el resto.
- e2e en `test/demo.e2e-spec.ts`.
