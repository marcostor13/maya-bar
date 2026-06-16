# Configuración de WhatsApp — MAYA Platform

## Opción A — Evolution API (recomendado para empezar)

Evolution API conecta un número de WhatsApp normal vía QR, igual que WhatsApp Web.  
No requiere aprobación de Meta ni número dedicado.

### 1. Instalar Evolution API con Docker

Crea el archivo `docker-compose.yml` en cualquier carpeta del servidor:

```yaml
version: "3.8"
services:
  evolution:
    image: atendai/evolution-api:latest
    container_name: evolution_api
    restart: always
    ports:
      - "8080:8080"
    environment:
      SERVER_URL: "http://localhost:8080"
      AUTHENTICATION_TYPE: "apikey"
      AUTHENTICATION_API_KEY: "pon-aqui-tu-clave-secreta"
      DATABASE_PROVIDER: "mongodb"
      DATABASE_CONNECTION_URI: "mongodb://localhost:27017/evolution"
      DATABASE_CONNECTION_DB_PREFIX_NAME: "evolution"
      LOG_LEVEL: "ERROR"
```

Luego ejecuta:
```bash
docker compose up -d
```

### 2. Datos que necesitas

| Campo              | Valor de ejemplo              | Dónde obtenerlo                    |
|--------------------|-------------------------------|------------------------------------|
| URL de la API      | `http://localhost:8080`       | La URL donde corre Docker          |
| API Key            | `pon-aqui-tu-clave-secreta`   | El valor que pusiste en el compose |
| Nombre de instancia| `maya`                        | Puedes elegir el que quieras       |

> Si Evolution corre en un servidor remoto, reemplaza `localhost` por la IP o dominio del servidor.

### 3. Conectar el número (en la app)

1. Ve a **Configuración → Integraciones** en la plataforma MAYA
2. Selecciona **Evolution API** como proveedor
3. Ingresa la URL, API Key e Instancia
4. Haz clic en **Guardar**
5. Haz clic en **Escanear QR**
6. Abre WhatsApp en el teléfono → **Dispositivos vinculados** → **Vincular un dispositivo**
7. Escanea el QR que aparece en pantalla
8. El estado cambiará a **Conectado ✓**

### 4. Limitaciones importantes

- El teléfono debe estar encendido y con internet (igual que WhatsApp Web)
- No uses el número de WhatsApp personal de alguien importante — si Meta detecta envío masivo puede banearlo
- Recomendado: usa un número secundario o un chip dedicado
- Límite informal: ~200-500 mensajes/día antes de riesgo de ban

---

## Opción B — WhatsApp Cloud API (Meta oficial)

La API oficial de Meta. Requiere cuenta de empresa verificada y templates aprobados para marketing.

### 1. Crear cuenta Meta Business

1. Ve a [business.facebook.com](https://business.facebook.com)
2. Crea o usa una cuenta de empresa existente
3. Completa la verificación del negocio (puede tardar 1-3 días)

### 2. Crear una App de Meta

1. Ve a [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**
2. Tipo: **Business**
3. Dale un nombre (ej: `MAYA WhatsApp`)
4. Asocia tu cuenta de Meta Business

### 3. Agregar WhatsApp al App

1. En el dashboard del App → **Add a Product** → **WhatsApp** → **Set Up**
2. Ve a **WhatsApp → API Setup**

### 4. Obtener Phone Number ID

En la sección **API Setup**:

```
From: [selecciona tu número de teléfono]
      ↓
Phone number ID: 123456789012345   ← copia este valor
```

> Si aún no tienes número aprobado, Meta te da un número de prueba gratuito.

### 5. Obtener Access Token permanente

El token temporal que aparece en la interfaz expira en 24h.  
Para un token permanente:

1. Ve a [business.facebook.com](https://business.facebook.com) → **Configuración** → **Usuarios del sistema**
2. Crea un **Usuario del sistema de administrador**
3. Asígnale el App como activo con permisos: `whatsapp_business_messaging`, `whatsapp_business_management`
4. Haz clic en **Generar token** → selecciona el App → selecciona los permisos
5. Copia el token generado (no tiene expiración)

### 6. Datos que necesitas

| Campo           | Dónde encontrarlo                              |
|-----------------|------------------------------------------------|
| Phone Number ID | WhatsApp → API Setup → From → Phone Number ID  |
| Access Token    | Business Settings → System Users → Generate Token |

### 7. Configurar en la app

1. Ve a **Configuración → Integraciones** en MAYA
2. Selecciona **WhatsApp Cloud API**
3. Pega el **Phone Number ID** y el **Access Token**
4. Haz clic en **Guardar y verificar**
5. Si las credenciales son válidas, el estado mostrará el número de teléfono activo

### 8. Templates para marketing (obligatorio)

La API oficial **solo permite mensajes libres** si el cliente te escribió primero (ventana de 24h).  
Para envíos masivos (campañas), necesitas **plantillas aprobadas**:

1. Ve a **WhatsApp Manager** (business.facebook.com → WhatsApp)
2. **Message Templates** → **Create Template**
3. Categoría: **Marketing**
4. Escribe el contenido con variables: `Hola {{1}}, tenemos algo especial para ti...`
5. Envía para revisión (aprobación en 24-48h)

> ⚠️ Sin template aprobado, la API rechazará los mensajes de campaña.

---

## Comparativa rápida

| Característica         | Evolution API          | Cloud API (Meta)        |
|------------------------|------------------------|-------------------------|
| Aprobación Meta        | No necesaria           | Sí (negocio verificado) |
| Templates obligatorios | No                     | Sí (para campañas)      |
| Costo                  | Solo hosting Docker    | ~USD 0.05-0.12/conv     |
| Setup                  | 15 minutos             | 2-5 días                |
| Volumen seguro         | ~500 msg/día           | Ilimitado (oficial)     |
| Riesgo de ban          | Moderado               | Ninguno                 |
| Recomendado para       | MVP / pruebas          | Producción a escala     |
