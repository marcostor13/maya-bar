/**
 * Catálogo de precios para la landing (HU56). La fuente única es el backend
 * (`backend/src/billing/plans.catalog.ts`, HU40, más add-ons y paquetes de
 * implementación). Este script lo transpila con esbuild y escribe
 * `src/app/shared/catalog.generated.json`, que se versiona: la imagen Docker
 * del frontend se construye sin el backend al lado y usa el archivo guardado.
 *
 *   node scripts/sync-catalog.mjs          → regenera (si existe ../backend)
 *   node scripts/sync-catalog.mjs --check  → falla si el archivo está desfasado
 */
import { build } from 'esbuild';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const billing = join(here, '..', '..', 'backend', 'src', 'billing');
const out = join(here, '..', 'src', 'app', 'shared', 'catalog.generated.json');
const check = process.argv.includes('--check');

if (!existsSync(join(billing, 'plans.catalog.ts'))) {
  console.log('[catalog] sin backend al lado: se usa el catálogo guardado');
  process.exit(0);
}

const entry = `
  export { publicCatalog } from ${JSON.stringify(join(billing, 'plans.catalog.ts'))};
  export { ADDONS, ADDON_IDS } from ${JSON.stringify(join(billing, 'addons.catalog.ts'))};
  export { SETUP_PACKAGES, SETUP_IDS, SETUP_ANNUAL_CREDIT } from ${JSON.stringify(join(billing, 'setup.catalog.ts'))};
`;
const tmp = join(tmpdir(), `maya-catalog-${process.pid}.mjs`);
await build({
  stdin: { contents: entry, resolveDir: billing, loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: tmp,
  logLevel: 'silent',
});
const m = await import(pathToFileURL(tmp).href);
const data = {
  ...m.publicCatalog(),
  addons: m.ADDON_IDS.map((id) => {
    const a = m.ADDONS[id];
    return { id, name: a.name, kind: a.kind, price: a.price };
  }),
  setup: {
    annualCredit: m.SETUP_ANNUAL_CREDIT,
    packages: m.SETUP_IDS.map((id) => ({ id, name: m.SETUP_PACKAGES[id].name, price: m.SETUP_PACKAGES[id].price })),
  },
};
const json = JSON.stringify(data, null, 2) + '\n';
const prev = existsSync(out) ? readFileSync(out, 'utf8') : '';
if (check) {
  if (prev !== json) {
    console.error('[catalog] catalog.generated.json no coincide con el backend: corre `npm run catalog`');
    process.exit(1);
  }
  console.log('[catalog] al día');
} else if (prev !== json) {
  writeFileSync(out, json);
  console.log('[catalog] actualizado', out);
} else console.log('[catalog] sin cambios');
