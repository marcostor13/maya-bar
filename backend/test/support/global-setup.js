const { startMongo } = require('./e2e-env');

/** Una Mongo en memoria para toda la corrida; cada archivo usa su propia base. */
module.exports = async () => {
  const mongo = await startMongo();
  globalThis.__E2E_MONGO__ = mongo;
  // Los workers de Jest heredan el entorno de este proceso.
  process.env.E2E_MONGO_BASE = mongo.getUri();
};
