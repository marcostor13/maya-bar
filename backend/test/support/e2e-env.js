const fs = require('fs');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

/** Credenciales del superadmin que siembra `UsersService` al arrancar. */
const ADMIN = { email: 'admin@e2e.test', password: 'SuperSecreta!42' };

/**
 * Deja el proceso sin ninguna credencial real antes de cargar la app.
 *
 * `ConfigModule` lee `backend/.env`, que en un equipo de desarrollo apunta a la
 * base y a los proveedores de verdad (Atlas, Resend, WhatsApp, S3…). Una
 * variable ya presente en `process.env` gana a la del archivo, así que se pisa
 * cada clave del `.env` con vacío: una prueba e2e nunca puede escribir en la
 * base real ni mandar un mensaje a un cliente.
 */
function isolateEnv(overrides) {
  const envFile = path.join(__dirname, '..', '..', '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=/.exec(line);
      if (match) process.env[match[1]] = '';
    }
  }
  Object.assign(
    process.env,
    {
      NODE_ENV: 'test',
      JWT_SECRET: 'e2e-secret-no-usar-fuera-de-pruebas',
      SEED_ADMIN_EMAIL: ADMIN.email,
      SEED_ADMIN_PASSWORD: ADMIN.password,
      WHATSAPP_PROVIDER: 'none',
    },
    overrides,
  );
  assertLocalMongo(process.env.MONGODB_URI);
}

/** Última barrera: si la URI no es local, no se arranca nada. */
function assertLocalMongo(uri) {
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri || '')) {
    throw new Error(
      `Las pruebas e2e solo corren contra una Mongo local en memoria (MONGODB_URI=${uri})`,
    );
  }
}

/**
 * Mongo en memoria. El primer arranque tras descargar el binario puede tardar
 * (el antivirus lo analiza), de ahí el margen sobre los 10 s por defecto.
 */
function startMongo() {
  return MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
}

module.exports = { ADMIN, isolateEnv, assertLocalMongo, startMongo };
