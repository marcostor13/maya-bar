/**
 * Backend para las pruebas de navegador (Playwright): la app compilada de
 * `dist/`, contra una Mongo en memoria y sin credenciales reales.
 *
 *   npm run build && node test/support/e2e-server.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isolateEnv, startMongo } = require('./e2e-env');

/**
 * Dónde dejar la URI de la Mongo en memoria para que las pruebas de navegador
 * siembren datos que no se pueden crear por la API (p. ej. chats entrantes).
 */
const MONGO_URI_FILE = path.join(os.tmpdir(), 'maya-e2e-mongo-uri');

async function main() {
  const mongo = await startMongo();
  fs.writeFileSync(MONGO_URI_FILE, mongo.getUri('maya-e2e'));
  isolateEnv({
    MONGODB_URI: mongo.getUri('maya-e2e'),
    PORT: process.env.E2E_API_PORT || '3100',
    CORS_ORIGINS: process.env.E2E_WEB_ORIGIN || 'http://localhost:4300',
  });

  const stop = () => void mongo.stop().finally(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  require('../../dist/main');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
