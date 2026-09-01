#!/usr/bin/env node
'use strict';
const { config, requireDomains } = require('./lib/config');

/**
 * Sincroniza en Cloudflare los registros A de los dominios públicos contra la
 * IP del servidor de Coolify. Sin túnel: los registros apuntan directamente a
 * `SERVER_IP` y Traefik resuelve el TLS con Let's Encrypt (HTTP-01), por eso
 * los registros van en gris (`proxied: false`) salvo que se fuerce lo contrario
 * con `CLOUDFLARE_PROXIED=true`.
 *
 * Uso: node scripts/dns.js [--check]
 */
const CF = 'https://api.cloudflare.com/client/v4';

async function cf(token, method, path, body) {
  const res = await fetch(`${CF}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(
      `Cloudflare ${method} ${path}: ${JSON.stringify(json.errors)}`,
    );
  }
  return json.result;
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const cfg = requireDomains(config());
  if (!cfg.cloudflare.token) throw new Error('Falta CLOUDFLARE_API_TOKEN');
  if (!cfg.serverIp) {
    throw new Error(
      'Falta SERVER_IP: es la IP pública del servidor de Coolify a la que apuntan los registros A',
    );
  }

  const { token, zone, proxied } = cfg.cloudflare;
  const zones = await cf(token, 'GET', `/zones?name=${encodeURIComponent(zone)}`);
  if (!zones.length) throw new Error(`La zona ${zone} no existe en esta cuenta de Cloudflare`);
  const zoneId = zones[0].id;
  console.log(`[dns] zona ${zone} (${zoneId}) estado=${zones[0].status}`);

  const wanted = [
    cfg.frontendDomain,
    `www.${cfg.frontendDomain}`,
    cfg.backendDomain,
  ];

  const existing = await cf(token, 'GET', `/zones/${zoneId}/dns_records?per_page=100`);

  for (const name of wanted) {
    const current = existing.find((r) => r.name === name && ['A', 'CNAME', 'AAAA'].includes(r.type));
    const desired = { type: 'A', name, content: cfg.serverIp, ttl: 1, proxied };

    if (!current) {
      if (checkOnly) {
        console.log(`[dns] FALTA  ${name} -> ${cfg.serverIp}`);
        continue;
      }
      await cf(token, 'POST', `/zones/${zoneId}/dns_records`, desired);
      console.log(`[dns] creado ${name} A ${cfg.serverIp} (proxied=${proxied})`);
      continue;
    }

    const ok =
      current.type === 'A' &&
      current.content === cfg.serverIp &&
      current.proxied === proxied;
    if (ok) {
      console.log(`[dns] ok     ${name} -> ${current.content} (proxied=${current.proxied})`);
      continue;
    }
    if (checkOnly) {
      console.log(`[dns] DIFIERE ${name}: ${current.type} ${current.content} proxied=${current.proxied}`);
      continue;
    }
    await cf(token, 'PUT', `/zones/${zoneId}/dns_records/${current.id}`, desired);
    console.log(`[dns] actualizado ${name} -> ${cfg.serverIp} (proxied=${proxied})`);
  }
}

main().catch((err) => {
  console.error(`[dns] ${err.message}`);
  process.exit(1);
});
