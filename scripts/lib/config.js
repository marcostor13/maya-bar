'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/**
 * Carga `.env` de la raíz sin pisar lo que ya venga del entorno. En local el
 * archivo existe; en GitHub Actions no, y todo llega por `env:` desde secrets.
 */
function loadDotenv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    let value = m[2].trim();
    if (/^(".*"|'.*')$/s.test(value)) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

function require_(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Falta la variable de entorno ${key}`);
  return value;
}

/** Dominio raíz de un FQDN: `api.mayacrm.site` -> `mayacrm.site`. */
function rootDomain(domain) {
  const parts = domain.split('.');
  return parts.length <= 2 ? domain : parts.slice(-2).join('.');
}

/**
 * `FRONTEND_DOMAIN`/`BACKEND_DOMAIN` no se exigen aquí: `deploy.js` solo
 * necesita credenciales y UUIDs, así que quien los use (dns/provision) los
 * valida con `requireDomains()`.
 */
function config() {
  loadDotenv();
  const frontendDomain = process.env.FRONTEND_DOMAIN || '';
  const backendDomain = process.env.BACKEND_DOMAIN || '';
  return {
    root: ROOT,
    coolify: {
      url: require_('COOLIFY_URL').replace(/\/+$/, ''),
      token: require_('COOLIFY_TOKEN'),
      projectUuid: process.env.COOLIFY_PROJECT_UUID || '',
      serverUuid: process.env.COOLIFY_SERVER_UUID || '',
      environment: process.env.COOLIFY_ENVIRONMENT || 'production',
      githubAppUuid: process.env.COOLIFY_GITHUB_APP_UUID || '',
      backendUuid: process.env.COOLIFY_BACKEND_UUID || '',
      frontendUuid: process.env.COOLIFY_FRONTEND_UUID || '',
    },
    github: {
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
      branch: process.env.GITHUB_BRANCH || 'main',
    },
    cloudflare: {
      token: process.env.CLOUDFLARE_API_TOKEN || '',
      zone:
        process.env.CLOUDFLARE_ZONE_NAME ||
        (frontendDomain ? rootDomain(frontendDomain) : ''),
      // Traefik resuelve los certificados por HTTP-01: con el proxy naranja
      // activado el reto lo intercepta Cloudflare y la emisión falla.
      proxied: process.env.CLOUDFLARE_PROXIED === 'true',
    },
    serverIp: process.env.SERVER_IP || '',
    frontendDomain,
    backendDomain,
    ports: {
      frontend: process.env.FRONTEND_PORT || '4000',
      backend: process.env.BACKEND_PORT || '3080',
    },
  };
}

function requireDomains(cfg) {
  if (!cfg.frontendDomain) throw new Error('Falta la variable de entorno FRONTEND_DOMAIN');
  if (!cfg.backendDomain) throw new Error('Falta la variable de entorno BACKEND_DOMAIN');
  return cfg;
}

module.exports = { config, requireDomains, rootDomain };
