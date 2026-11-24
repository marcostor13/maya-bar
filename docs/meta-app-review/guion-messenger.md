# Video A — Facebook Page + Messenger

Permisos: `pages_show_list`, `pages_manage_metadata`, `pages_messaging`.
Duración objetivo: 2–3 min. Subtítulos: `captions/messenger.srt` (los números
de escena coinciden con los subtítulos).

Pantalla dividida o dos ventanas: **izquierda Maya** (`https://mayacrm.site`),
**derecha Messenger** de la segunda cuenta (`messenger.com` o la app en el
teléfono con espejo de pantalla).

| # | Qué se ve | Permiso que demuestra |
|---|---|---|
| 1 | Login en Maya con la cuenta de prueba (correo visible, contraseña oculta). | — |
| 2 | Menú Configuración > Messenger. Lista vacía: no hay Página conectada. | — |
| 3 | Clic en **"Conectar con Facebook"**. Se abre el diálogo de Facebook. Iniciar sesión si lo pide y **mostrar la pantalla con los permisos** (pages_show_list, pages_messaging, pages_manage_metadata). Continuar. | Login de Meta completo |
| 4 | En el diálogo, **elegir la Página** (nombre visible) y aceptar. | `pages_show_list` |
| 5 | De vuelta en Maya: la lista de Páginas del usuario; se selecciona la misma Página y queda conectada (nombre e ID visibles). | `pages_show_list` |
| 6 | Clic en **"Suscribir webhook"** de esa Página: mensaje de éxito. Explicar que suscribe la Página al campo `messages` del webhook. | `pages_manage_metadata` (1) |
| 7 | En Messenger (derecha), la segunda cuenta escribe a la Página: "Hi, do you have availability tomorrow?" | — |
| 8 | En Maya, Bandeja de entrada: **llega la conversación nueva** de esa Página (canal Messenger, mismo nombre de Página). Es el evento de webhook en vivo. | `pages_manage_metadata` (2) |
| 9 | Abrir la conversación, escribir "Yes! We have slots at 10am and 3pm." y **Enviar**. | `pages_messaging` |
| 10 | En Messenger (derecha): **aparece la respuesta** enviada desde Maya. Mantener 3 s en pantalla. | `pages_messaging` (cliente nativo) |
| 11 | Cierre: la conversación en Maya muestra ambos mensajes. | — |

Consejos:
- No cortes entre la 3 y la 5: el revisor quiere ver el login sin saltos.
- Si el agente de IA responde solo, desactívalo en esa conversación antes de
  grabar (modo manual) para que la respuesta de la escena 9 sea la que escribes.
