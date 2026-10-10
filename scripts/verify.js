#!/usr/bin/env node
/**
 * Puerta de calidad: corre en orden lint, builds, unitarias y e2e de todo el
 * monorepo y se detiene en el primer fallo.
 *
 *   node scripts/verify.js            # todo
 *   node scripts/verify.js unit       # solo unitarias
 *   node scripts/verify.js e2e        # solo e2e (API + navegador)
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

const STEPS = [
  { group: 'static', name: 'Lint backend', cwd: 'backend', cmd: 'npx eslint "src/**/*.ts" --max-warnings=100' },
  { group: 'static', name: 'Build backend', cwd: 'backend', cmd: 'npm run build' },
  { group: 'unit', name: 'Unitarias backend', cwd: 'backend', cmd: 'npm test -- --silent' },
  { group: 'e2e', name: 'e2e de API', cwd: 'backend', cmd: 'npm run test:e2e -- --silent' },
  { group: 'unit', name: 'Unitarias frontend', cwd: 'frontend', cmd: 'npx ng test --watch=false' },
  { group: 'static', name: 'Build frontend', cwd: 'frontend', cmd: 'npm run build' },
  { group: 'e2e', name: 'e2e de navegador', cwd: 'frontend', cmd: 'npm run e2e' },
];

const only = process.argv[2];
const steps = only ? STEPS.filter((s) => s.group === only) : STEPS;
if (!steps.length) {
  console.error(`Grupo desconocido: ${only}. Usa: static | unit | e2e`);
  process.exit(2);
}

const results = [];
for (const step of steps) {
  console.log(`\n━━ ${step.name} ━━ (${step.cwd}) ${step.cmd}`);
  const started = Date.now();
  const { status } = spawnSync(step.cmd, {
    cwd: path.join(root, step.cwd),
    stdio: 'inherit',
    shell: true,
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  results.push({ ...step, ok: status === 0, seconds });
  if (status !== 0) break;
}

console.log('\n━━ Resumen ━━');
for (const r of results)
  console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.name} (${r.seconds}s)`);
for (const s of steps.slice(results.length)) console.log(`—     ${s.name} (no se ejecutó)`);

process.exit(results.every((r) => r.ok) && results.length === steps.length ? 0 : 1);
