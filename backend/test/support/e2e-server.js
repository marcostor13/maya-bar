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
/** Registro de las llamadas a la API de llamadas de Meta simulada (una por línea). */
const GRAPH_LOG_FILE = path.join(os.tmpdir(), 'maya-e2e-graph-calls.log');

/**
 * Simula la Calling API de WhatsApp: en e2e no hay credenciales y nunca se
 * habla con Meta. El resto de Graph sigue sin red útil, como antes.
 */
function stubMetaCalling() {
  fs.writeFileSync(GRAPH_LOG_FILE, '');
  const realFetch = globalThis.fetch;
  let out = 0;
  const json = (body) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  globalThis.fetch = async (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const m = /^https:\/\/graph\.facebook\.com\/v[\d.]+\/[^/]+\/(calls|call_permissions|settings)(\?|$)/.exec(url);
    if (!m) return realFetch(input, init);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    fs.appendFileSync(
      GRAPH_LOG_FILE,
      JSON.stringify({ method: init.method || 'GET', kind: m[1], action: body.action, hasSdp: !!body.session?.sdp }) + '\n',
    );
    if (m[1] === 'calls')
      return json(body.action === 'connect' ? { calls: [{ id: `wacid.e2e-out-${++out}` }] } : { success: true });
    if (m[1] === 'call_permissions')
      return json({
        permission: { status: 'temporary', expiration_time: Math.floor(Date.now() / 1000) + 7 * 86400 },
        actions: [{ action_name: 'start_call', can_perform_action: true }],
      });
    return json(init.method === 'POST' ? { success: true } : { calling: { status: 'ENABLED', call_icon_visibility: 'DEFAULT' } });
  };
}

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

  stubMetaCalling();
  require('../../dist/main');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
