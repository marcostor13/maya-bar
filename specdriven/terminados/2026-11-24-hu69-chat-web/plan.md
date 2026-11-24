# HU69 · plan
1. Esquema `WebWidget` + `WebChatHub` en conversaciones; canal `web` en enums y `deliver()`.
2. `ConversationsService`: `handleWebInbound`, `webHistory`, `identifyWebVisitor`, `webAgent`; cuentas web en `listAccounts`.
3. Módulo `webchat`: servicio (config, resolve de dominio, token HMAC, sesión), controlador (admin + público + SSE), script del widget.
4. CORS `/public/webchat`; origen `web` en Customer.
5. e2e (C1, C2, identificación, token alterado, honeypot).
6. Frontend: tarjeta de Ajustes, canal en la bandeja, etiqueta de origen en contactos; specs y build.
