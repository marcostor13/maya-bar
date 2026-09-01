#!/usr/bin/env node
'use strict';
const { config, requireDomains } = require('./lib/config');
const { Coolify } = require('./lib/coolify');

/**
 * Aprovisiona en Coolify las dos aplicaciones del monorepo (backend NestJS y
 * frontend Angular SSR) y deja sus dominios y variables alineados con el `.env`.
 *
 *   node scripts/provision.js --list    lista proyectos, servidores y apps
 *   node scripts/provision.js           crea/actualiza ambas aplicaciones
 *   node scripts/provision.js --check   solo informa, no escribe
 *
 * Es idempotente: si la app ya existe se actualiza en lugar de duplicarse.
 */

const FRONTEND_NAME = 'Maya CRM Web';
const BACKEND_NAME = 'Maya bar';

async function list(api) {
  const [projects, servers, apps, ghApps] = await Promise.all([
    api.projects(),
    api.servers(),
    api.applications(),
    api.githubApps(),
  ]);
  const row = (o) => JSON.stringify(o);
  console.log('\n# Proyectos');
  projects.forEach((p) => console.log(row({ uuid: p.uuid, name: p.name })));
  console.log('\n# Servidores');
  servers.forEach((s) => console.log(row({ uuid: s.uuid, name: s.name, ip: s.ip })));
  console.log('\n# GitHub Apps');
  ghApps.forEach((g) => console.log(row({ uuid: g.uuid, name: g.name })));
  console.log('\n# Aplicaciones');
  apps.forEach((a) =>
    console.log(
      row({
        uuid: a.uuid,
        name: a.name,
        fqdn: a.fqdn,
        repo: a.git_repository,
        base: a.base_directory,
        status: a.status,
      }),
    ),
  );
}

/** Busca la app por UUID configurado o, si no, por repositorio + subdirectorio. */
function findApp(apps, { uuid, repo, baseDirectory }) {
  if (uuid) {
    const byUuid = apps.find((a) => a.uuid === uuid);
    if (byUuid) return byUuid;
  }
  return apps.find(
    (a) => a.git_repository === repo && a.base_directory === baseDirectory,
  );
}

async function ensureApp(api, cfg, spec, check) {
  const apps = await api.applications();
  let app = findApp(apps, spec);

  if (!app) {
    if (check) {
      console.log(`[provision] FALTA la aplicación ${spec.name} (${spec.baseDirectory})`);
      return null;
    }
    if (!cfg.coolify.githubAppUuid) {
      throw new Error(
        'Falta COOLIFY_GITHUB_APP_UUID: obtenlo con `npm run coolify:list` (sección GitHub Apps)',
      );
    }
    console.log(`[provision] creando ${spec.name}…`);
    const created = await api.createPrivateGithubApp({
      project_uuid: cfg.coolify.projectUuid,
      server_uuid: cfg.coolify.serverUuid,
      environment_name: cfg.coolify.environment,
      github_app_uuid: cfg.coolify.githubAppUuid,
      git_repository: spec.repo,
      git_branch: cfg.github.branch,
      build_pack: 'dockerfile',
      base_directory: spec.baseDirectory,
      dockerfile_location: '/Dockerfile',
      ports_exposes: spec.port,
      name: spec.name,
      domains: spec.domains,
      instant_deploy: false,
    });
    app = await api.application(created.uuid);
    console.log(`[provision] creada ${spec.name} uuid=${app.uuid}`);
  }

  const patch = {};
  if (app.fqdn !== spec.domains) patch.domains = spec.domains;
  if (app.base_directory !== spec.baseDirectory) patch.base_directory = spec.baseDirectory;
  if (app.dockerfile_location !== '/Dockerfile') patch.dockerfile_location = '/Dockerfile';
  if (String(app.ports_exposes) !== String(spec.port)) patch.ports_exposes = spec.port;
  if (app.build_pack !== 'dockerfile') patch.build_pack = 'dockerfile';
  if ((app.watch_paths || '') !== spec.watchPaths) patch.watch_paths = spec.watchPaths;

  // La API no devuelve estos campos en el GET, así que no se pueden comparar:
  // se aplican siempre. `is_auto_deploy_enabled: false` deja a GitHub Actions
  // como único disparador (si no, el webhook de la GitHub App desplegaría
  // además por su cuenta y habría dos despliegues por push).
  Object.assign(patch, { is_auto_deploy_enabled: false, ...spec.policy });

  if (Object.keys(patch).length) {
    if (check) {
      console.log(`[provision] DIFIERE ${spec.name}: ${JSON.stringify(patch)}`);
    } else {
      await api.updateApplication(app.uuid, patch);
      console.log(`[provision] actualizada ${spec.name}: ${JSON.stringify(patch)}`);
    }
  }

  // Todas las variables se marcan como build-time y runtime: el frontend
  // necesita BACKEND_URL/SITE_URL como build args (set-env.js las incrusta en
  // el bundle) y el resto se lee al arrancar el contenedor.
  const current = await api.envs(app.uuid);
  for (const [key, value] of Object.entries(spec.env)) {
    const found = current.find((e) => e.key === key);
    if (found && found.value === value && found.is_buildtime && found.is_runtime) continue;
    if (check) {
      console.log(`[provision] DIFIERE env ${spec.name}.${key} = ${found ? found.value : '(vacío)'} -> ${value}`);
      continue;
    }
    await api.upsertEnv(app.uuid, key, value, { exists: Boolean(found) });
    console.log(`[provision] env ${spec.name}.${key} = ${value}`);
  }

  return app;
}

async function main() {
  const cfg = config();
  const api = new Coolify(cfg.coolify);

  if (process.argv.includes('--list')) return list(api);
  requireDomains(cfg);
  const check = process.argv.includes('--check');

  const repo = `${cfg.github.owner}/${cfg.github.repo}`;
  const siteUrl = `https://${cfg.frontendDomain}`;
  const apiUrl = `https://${cfg.backendDomain}`;

  const backend = await ensureApp(api, cfg, {
    name: BACKEND_NAME,
    uuid: cfg.coolify.backendUuid,
    repo,
    baseDirectory: '/backend',
    port: cfg.ports.backend,
    domains: apiUrl,
    watchPaths: 'backend/**',
    policy: {},
    env: {
      PORT: cfg.ports.backend,
      NODE_ENV: 'production',
      FRONTEND_URL: siteUrl,
      PUBLIC_API_URL: apiUrl,
      CORS_ORIGINS: `${siteUrl},https://www.${cfg.frontendDomain},http://localhost:4200`,
    },
  }, check);

  const frontend = await ensureApp(api, cfg, {
    name: FRONTEND_NAME,
    uuid: cfg.coolify.frontendUuid,
    repo,
    baseDirectory: '/frontend',
    port: cfg.ports.frontend,
    domains: `${siteUrl},https://www.${cfg.frontendDomain}`,
    watchPaths: 'frontend/**',
    // `/healthz` lo sirve Express antes de pasar por Angular, así que responde
    // aunque el host de la petición interna no esté en `allowedHosts`.
    policy: {
      health_check_enabled: true,
      health_check_path: '/healthz',
      health_check_port: cfg.ports.frontend,
    },
    env: {
      BACKEND_URL: apiUrl,
      SITE_URL: siteUrl,
      WHATSAPP_NUMBER: process.env.WHATSAPP_NUMBER || '51975760418',
      PORT: cfg.ports.frontend,
      NODE_ENV: 'production',
      NG_ALLOWED_HOSTS: `${cfg.frontendDomain},www.${cfg.frontendDomain}`,
    },
  }, check);

  console.log('\n[provision] UUIDs (guárdalos como secrets de GitHub):');
  if (backend) console.log(`COOLIFY_BACKEND_UUID=${backend.uuid}`);
  if (frontend) console.log(`COOLIFY_FRONTEND_UUID=${frontend.uuid}`);
}

main().catch((err) => {
  console.error(`[provision] ${err.message}`);
  process.exit(1);
});
