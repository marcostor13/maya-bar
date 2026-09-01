#!/usr/bin/env node
'use strict';
const { config } = require('./lib/config');
const { Coolify } = require('./lib/coolify');

/**
 * Dispara despliegues en Coolify y espera a que terminen. Lo usa el workflow
 * de GitHub Actions y también sirve en local.
 *
 *   node scripts/deploy.js backend
 *   node scripts/deploy.js frontend
 *   node scripts/deploy.js all --force
 *   node scripts/deploy.js backend --no-wait
 */
const POLL_MS = 10_000;
const TIMEOUT_MS = 20 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDeployment(api, uuid, label) {
  const started = Date.now();
  let last = '';
  while (Date.now() - started < TIMEOUT_MS) {
    await sleep(POLL_MS);
    const d = await api.get(`/api/v1/deployments/${uuid}`);
    const status = d.status || 'unknown';
    if (status !== last) {
      console.log(`[deploy] ${label}: ${status}`);
      last = status;
    }
    if (['finished', 'success'].includes(status)) return true;
    if (['failed', 'cancelled-by-user', 'cancelled'].includes(status)) {
      throw new Error(`El despliegue de ${label} terminó en estado "${status}"`);
    }
  }
  throw new Error(`Timeout esperando el despliegue de ${label}`);
}

async function main() {
  const cfg = config();
  const api = new Coolify(cfg.coolify);

  const target = (process.argv[2] || 'all').toLowerCase();
  const force = process.argv.includes('--force');
  const wait = !process.argv.includes('--no-wait');

  const targets = {
    backend: cfg.coolify.backendUuid,
    frontend: cfg.coolify.frontendUuid,
  };
  const selected =
    target === 'all' ? Object.keys(targets) : target.split(',').map((t) => t.trim());

  const invalid = selected.filter((t) => !(t in targets));
  if (invalid.length) throw new Error(`Destino desconocido: ${invalid.join(', ')}`);

  const missing = selected.filter((t) => !targets[t]);
  if (missing.length) {
    throw new Error(
      `Falta el UUID de: ${missing.join(', ')}. Define COOLIFY_${missing[0].toUpperCase()}_UUID (ver \`npm run coolify:list\`).`,
    );
  }

  const started = [];
  for (const name of selected) {
    const res = await api.deploy(targets[name], force);
    const dep = (res && (res.deployments || [])[0]) || {};
    console.log(`[deploy] ${name} (${targets[name]}) lanzado: ${dep.deployment_uuid || JSON.stringify(res)}`);
    if (dep.deployment_uuid) started.push({ name, uuid: dep.deployment_uuid });
  }

  if (!wait || !started.length) return;
  await Promise.all(started.map((d) => waitForDeployment(api, d.uuid, d.name)));
  console.log('[deploy] todos los despliegues terminaron correctamente');
}

main().catch((err) => {
  console.error(`[deploy] ${err.message}`);
  process.exit(1);
});
