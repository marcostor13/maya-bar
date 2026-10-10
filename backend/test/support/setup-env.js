const crypto = require('crypto');
const { isolateEnv } = require('./e2e-env');

// Corre en cada archivo de pruebas ANTES de importar la app: una base nueva por
// archivo, para que ninguno dependa de lo que dejó otro.
const base = new URL(process.env.E2E_MONGO_BASE);
base.pathname = `/e2e-${crypto.randomBytes(6).toString('hex')}`;
isolateEnv({ MONGODB_URI: base.toString() });
