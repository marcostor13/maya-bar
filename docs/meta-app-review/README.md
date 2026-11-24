# Revisión de la app de Meta "Maya IA": cómo subsanar el rechazo

App `985986576689480`, portfolio `1181735023516920`. Solicitud `1443840707570729`
(resultado del 2026-11-24).

## Resultado

| Permiso | Estado | Motivo |
|---|---|---|
| `whatsapp_business_management` | **Aprobado** (acceso avanzado) | — |
| `whatsapp_business_messaging` | **Aprobado** (acceso avanzado) | — |
| `instagram_business_basic` | Rechazado | El video no muestra el caso de uso completo |
| `instagram_business_manage_messages` | Rechazado | El video no muestra un mensaje enviado desde Maya que llegue a Instagram |
| `pages_show_list` | Rechazado | El video no muestra el caso de uso completo |
| `pages_manage_metadata` | Rechazado | Falta mostrar dónde Maya se suscribe a los eventos de la Página y un evento de webhook que llega |
| `pages_messaging` | Rechazado | El video no muestra un mensaje enviado desde Maya que llegue a Messenger |

Meta aclara que **el caso de uso está permitido**. Solo hay que rehacer los
videos. Notas del revisor, resumidas:

- **Mensajería** (Instagram y Messenger), tres cosas en pantalla:
  1. elegir el activo, con la Página o la cuenta visibles;
  2. enviar un mensaje en vivo desde Maya;
  3. el mismo mensaje entregado en el cliente nativo (Messenger o Instagram).
- **`pages_manage_metadata`**:
  1. el lugar donde Maya suscribe la Página a los eventos;
  2. un evento de webhook que llega a Maya, de la misma Página.
- **Todos los permisos**:
  - el flujo completo de inicio de sesión de Meta, incluida la pantalla de permisos;
  - interfaz en inglés o subtítulos en inglés que expliquen cada botón.

## Qué se cambió en Maya para los videos

- El login de Páginas ya no pide `leads_retrieval` ni `pages_read_engagement`,
  que no están en esta solicitud. Solo los pide con `META_LEAD_ADS_ENABLED=true`.
  Así, el diálogo de Facebook del video muestra exactamente los tres permisos
  solicitados.
- Maya no tiene interfaz en inglés, así que se usan **subtítulos en inglés
  quemados en el video**. Los archivos están en `captions/`.

## Videos a grabar (2)

Un mismo video puede adjuntarse a varios permisos.

| Video | Permisos | Guion | Subtítulos |
|---|---|---|---|
| A. Facebook Page + Messenger | `pages_show_list`, `pages_manage_metadata`, `pages_messaging` | [guion-messenger.md](guion-messenger.md) | `captions/messenger.srt` |
| B. Instagram | `instagram_business_basic`, `instagram_business_manage_messages` | [guion-instagram.md](guion-instagram.md) | `captions/instagram.srt` |

### Antes de grabar

1. **Despliega** la versión con el cambio de permisos del login de Páginas.
2. **Quita "Maya IA" de las integraciones** para que Meta vuelva a mostrar la
   pantalla de permisos completa:
   - Facebook: Configuración > Integraciones comerciales;
   - Instagram: Configuración > Apps y sitios web.
3. **Desconecta** en Maya la Página y la cuenta de Instagram que vas a usar.
4. **Prepara una segunda cuenta** (otro teléfono o navegador) que escriba a la
   Página y a la cuenta de Instagram. Tiene que tener rol en la app (Roles >
   Evaluadores) mientras la app siga en modo Desarrollo, o los mensajes no llegan.
5. Pon Facebook e Instagram **en inglés** en esa sesión si puedes. Ayuda, pero
   no es obligatorio.
6. Graba a 1280×720 o más, sin cortar el login. No hace falta audio.

### Convertir y poner los subtítulos

Ajusta los tiempos del `.srt` a tu grabación (cualquier editor de texto sirve) y
ejecuta, desde esta carpeta:

```bash
./burn-captions.sh grabacion-messenger.mov captions/messenger.srt video-A-messenger.mp4
./burn-captions.sh grabacion-instagram.mov captions/instagram.srt video-B-instagram.mp4
```

### Volver a solicitar

1. Ve a Revisión de la app > Solicitudes > "Volver a solicitar".
2. Agrega los 5 permisos rechazados. Los de WhatsApp ya están aprobados: no los
   vuelvas a pedir.
3. En cada permiso:
   - pega la descripción de [notas-revisor.md](notas-revisor.md);
   - adjunta el video que le toca;
   - marca las casillas de uso permitido (las certificaciones las marcas tú).
4. En "Instrucciones para revisores":
   - pega el texto general de `notas-revisor.md`;
   - pon el usuario y la contraseña de una cuenta de prueba de Maya, una que
     el revisor pueda usar y que no sea la tuya.
5. Envía la solicitud.
