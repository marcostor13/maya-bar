# App Android (Capacitor)

La app nativa empaqueta el mismo frontend Angular dentro de un WebView. No es
un proyecto aparte: comparte código, rutas y componentes con la web.

## Estructura

| Pieza | Dónde |
|---|---|
| Proyecto Angular estático | `angular.json` → proyecto **`mobile`** (sin SSR) |
| Configuración de Capacitor | `frontend/capacitor.config.ts` |
| Proyecto Android | `frontend/android/` (versionado) |
| Fuentes de icono y splash | `frontend/assets/` (generadas) |
| Generador de assets | `frontend/scripts/generate-app-assets.mjs` |

El proyecto `frontend` sigue siendo el de la web con SSR. **La app usa
`mobile`**: el output de SSR no sirve dentro de un WebView.

## Comandos

```bash
cd frontend

bun run build:mobile     # build estático → dist/mobile/browser
bun run cap:sync         # build + copia a android/
bun run cap:open         # abre Android Studio
bun run cap:run          # build + sync + instala en el dispositivo conectado
bun run assets:android   # regenera icono, splash e icono de notificación
```

## Requisitos del entorno

```bash
# Gradle necesita JDK 17 o 21. El java del PATH puede ser más nuevo y fallar.
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
```

`android/local.properties` (gitignored) debe apuntar al SDK, con barras normales:

```
sdk.dir=C:/Users/<usuario>/AppData/Local/Android/Sdk
```

## Notificaciones push (FCM)

El código está completo en ambos lados. Falta dar de alta el proyecto de
Firebase, que requiere una cuenta de Google.

### 1. Firebase

1. Crear un proyecto en <https://console.firebase.google.com>.
2. Añadir una app **Android** con el `applicationId` exacto: `site.mayacrm.app`.
3. Descargar `google-services.json` y dejarlo en `frontend/android/app/`.
   El plugin de Gradle se aplica solo si el archivo existe, así que hasta
   entonces la app compila igual pero el registro de push falla.
4. En *Configuración del proyecto → Cuentas de servicio → Generar nueva clave
   privada*, descargar el JSON de la cuenta de servicio.

### 2. Backend

Del JSON de la cuenta de servicio salen tres variables de `backend/.env`:

```
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...   # en una línea, con los saltos como \n
```

Sin ellas el backend arranca igual y `PushService` queda inactivo: cada envío
es un no-op registrado en el log. `GET /devices/status` dice si está activo.

### 3. Cómo funciona

- El alta la hace el usuario desde **Configuración → Notificaciones**. No se
  pide el permiso al entrar: en Android 13+ solo hay una oportunidad.
- El token se guarda en `device_tokens` asociado a usuario y empresa, y se da
  de baja al cerrar sesión.
- Los avisos se envían con `PushService.sendToTenantModule(tenantId, módulo, …)`,
  que solo llega a quien tiene ese módulo en su matriz de permisos.
- Los tokens caducados se borran solos al primer envío fallido.

Disparadores actuales:

| Evento | Módulo | Ruta al tocar |
|---|---|---|
| Mensaje entrante de WhatsApp/Instagram | `inbox` | `/inbox` |
| Registro nuevo en un formulario | `forms` | `/forms` |

## Publicación

1. Generar el almacén de claves (**una sola vez**; si se pierde, Play Store ya
   no acepta actualizaciones y hay que publicar la app como nueva):

   ```bash
   cd frontend/android
   keytool -genkeypair -v -keystore maya-release.keystore \
     -alias maya -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Copiar `key.properties.example` a `key.properties` y rellenar las
   contraseñas. Ambos archivos, el keystore y `key.properties`, están fuera del
   control de versiones.

3. Subir `versionCode` y `versionName` en `android/app/build.gradle`.

4. Construir el bundle para Play Console:

   ```bash
   cd frontend && bun run cap:sync
   cd android && ./gradlew bundleRelease
   # → app/build/outputs/bundle/release/app-release.aab
   ```

Sin `key.properties` la release se genera sin firmar (`app-release-unsigned.apk`),
que es lo correcto en un entorno que no debe poder publicar.

Para la ficha de Play hacen falta además: política de privacidad (hay dominio
propio), y la declaración de los permisos de cámara (lectura de QR) y
notificaciones.

## Detalles que conviene no romper

- **`viewport-fit=cover`** en `index.html`: sin él `env(safe-area-inset-*)` vale
  siempre 0 y la cabecera se mete debajo de la cámara.
- Las áreas seguras se usan por las variables `--safe-top` / `--safe-bottom` /
  `--safe-left` / `--safe-right` de `styles.scss`. Con `targetSdk` 36 Android
  fuerza el modo edge-to-edge, así que `StatusBar.setBackgroundColor` y
  `setOverlaysWebView` son no-ops: el color bajo la barra de estado lo pinta la
  cabecera de la app.
- **`rootEntryGuard`**: dentro de la app `/` lleva a la aplicación, no a la
  landing de marketing. En web no hace nada y el prerender sigue intacto.
- El backend acepta siempre los orígenes `https://localhost` y
  `capacitor://localhost`, también cuando `CORS_ORIGINS` está definido.
- El permiso `CAMERA` del manifest es obligatorio para el escaneo de QR
  (`html5-qrcode` en bandeja, check-in de eventos y campañas).
- Un backtick dentro de un comentario CSS en `styles: [...]` rompe la
  compilación de Angular con un error que no dice el archivo.
