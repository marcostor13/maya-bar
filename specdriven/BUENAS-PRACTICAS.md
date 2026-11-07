# Buenas prácticas de desarrollo

Estándar que se aplica en cada historia. Las reglas propias del proyecto
(`config.md`) prevalecen si chocan con estas.

## Diseño y alcance

- **Rebanadas verticales pequeñas**: cada entrega atraviesa datos → API →
  interfaz y deja el producto usable. Nada de capas a medias.
- **YAGNI y simplicidad**: la solución más simple que cumple la spec. Sin
  abstracciones para casos que no existen.
- **Contrato primero**: definir tipos/DTO/esquemas de la API antes de la
  implementación; validar toda entrada en el borde (servidor), nunca confiar
  en el cliente.
- **Decisiones registradas**: lo que cueste revertir (librería, modelo de datos,
  proveedor) va a un ADR en `decisiones/`.

## Código

- Tipado estricto; sin `any` salvo en el borde con datos externos, y ahí se
  valida.
- Funciones pequeñas con un propósito; nombres que expliquen la intención.
- Errores explícitos: mensajes útiles para el usuario, detalle técnico al log.
  Nunca tragar excepciones.
- Comentarios para el *por qué*, no para el *qué*.
- Sin código muerto, `TODO` sin dueño ni datos simulados en producción.

## Pruebas

- **Pirámide**: muchas unitarias rápidas, algunas de integración/contrato,
  pocas e2e para los flujos críticos.
- Se prueba el comportamiento observable, no la implementación. Cada bug
  arreglado deja una prueba que lo reproduce.
- Pruebas deterministas: sin esperas fijas, sin depender de la red real, reloj
  controlado, datos aislados.
- Cada servicio o módulo nuevo trae su prueba.

## Seguridad (OWASP Top 10 / ASVS)

- **Autorización en el servidor** en cada endpoint; aislamiento por
  tenant/usuario tomado del token, nunca del cuerpo de la petición.
- **Secretos** fuera del código: variables de entorno o gestor de secretos;
  tokens de terceros cifrados en reposo; nunca en respuestas ni en logs.
- **OAuth 2.0 / OIDC** con *authorization code + PKCE* y `state` contra CSRF;
  scopes mínimos; refresco de tokens del lado servidor; revocación al
  desconectar.
- Entradas validadas y salidas codificadas (sin `innerHTML` con datos del
  usuario); consultas parametrizadas.
- Webhooks: verificar firma; operaciones **idempotentes** (reintentos sin
  duplicar efectos).
- Dependencias: mínimas, mantenidas, auditadas (`npm audit` o equivalente).
- Funciones con IA: tratar el texto del usuario y de terceros como no
  confiable (*prompt injection*); las herramientas que el modelo puede llamar
  validan sus argumentos y tienen permisos mínimos; acciones irreversibles con
  confirmación.

## Datos y privacidad

- Minimizar datos personales; no enviarlos a terceros sin necesidad.
- Migraciones compatibles hacia atrás (*expand → migrate → contract*); nunca
  borrar datos sin respaldo.
- Fechas en UTC en almacenamiento; zona horaria explícita al mostrar o al
  hablar con el usuario.

## Interfaz y accesibilidad

- WCAG 2.2 AA: contraste, foco visible, navegación con teclado, `aria-*` y
  textos alternativos, objetivos táctiles ≥ 24 px.
- Estados completos: cargando, vacío, error y éxito; feedback de cada acción.
- Mobile first; textos en el idioma del usuario.

## Observabilidad y operación

- Logs estructurados con contexto (ids, no datos personales).
- Errores de integraciones externas con mensaje accionable para el usuario.
- Cambios arriesgados detrás de *feature flag* o desactivables por
  configuración.

## Flujo de trabajo

- *Trunk-based*: ramas cortas, integración frecuente, CI verde antes de mezclar.
- Commits pequeños con mensaje claro (Conventional Commits recomendado).
- Revisión de código con checklist: spec cumplida, pruebas, seguridad,
  accesibilidad, rendimiento.

## Trabajo con agentes de IA

- Spec antes que código; el agente no "recuerda" que algo funciona: lo prueba.
- Verificación independiente (otro agente o persona) antes de dar por hecho.
- Afirmaciones con evidencia (`archivo:línea`, salida de comando).
- El agente no maneja credenciales ni actúa en consolas externas: deja
  instrucciones al usuario.
