/**
 * Backend para las pruebas de navegador (Playwright): la app compilada de
 * `dist/`, contra una Mongo en memoria y sin credenciales reales.
 *
 *   npm run build && node test/support/e2e-server.js
 */
const { isolateEnv, startMongo } = require('./e2e-env');

async function main() {
  const mongo = await startMongo();
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
