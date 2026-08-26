/**
 * Normaliza los teléfonos ya guardados al formato único de la plataforma
 * (`+51 999 999 999`) y fusiona los contactos que, tras normalizar, resultan
 * ser la misma persona.
 *
 * Uso:
 *   node scripts/normalize-phones.js            # simulación, no escribe nada
 *   node scripts/normalize-phones.js --apply    # aplica los cambios
 *
 * La deduplicación respeta el alcance de los índices únicos de la colección:
 * (tenantId, createdBy, teléfono). Los impulsadores tienen su propia agenda, de
 * modo que dos contactos con el mismo número pero distinto dueño NO se fusionan.
 */
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const { MongoClient } = require('mongodb');
require('dotenv').config();

const { formatPhone } = require('../dist/shared/phone');

const APPLY = process.argv.includes('--apply');

/** Puntuación para decidir qué contacto sobrevive a la fusión. */
function score(doc) {
  return (
    (doc.email ? 8 : 0) +
    (doc.name && doc.name !== 'Sin nombre' ? 4 : 0) +
    (doc.totalReservations || 0) +
    (doc.totalEvents || 0) +
    (doc.tags?.length || 0) +
    Object.keys(doc.customFields || {}).length +
    (doc.notes ? 1 : 0)
  );
}

/** Clave de unicidad: la misma que usan los índices de `customers`. */
function groupKey(doc, phone) {
  return [String(doc.tenantId), String(doc.createdBy ?? '-'), phone].join('|');
}

/** Vuelca en el superviviente lo que el duplicado tuviera y él no. */
function merge(winner, loser) {
  const set = {};
  const custom = { ...(loser.customFields || {}), ...(winner.customFields || {}) };

  if (!winner.email && loser.email) set.email = loser.email;
  // Dos emails distintos con el mismo teléfono: el índice solo admite uno,
  // así que el otro se conserva como dato adicional en vez de perderse.
  else if (winner.email && loser.email && winner.email !== loser.email)
    custom['Email alternativo'] = loser.email;

  if ((!winner.name || winner.name === 'Sin nombre') && loser.name) set.name = loser.name;
  if (!winner.notes && loser.notes) set.notes = loser.notes;
  if (!winner.lastVisit && loser.lastVisit) set.lastVisit = loser.lastVisit;
  if (!winner.sourceLabel && loser.sourceLabel) set.sourceLabel = loser.sourceLabel;
  if (!winner.sourceUrl && loser.sourceUrl) set.sourceUrl = loser.sourceUrl;
  if (!winner.formId && loser.formId) set.formId = loser.formId;

  set.totalReservations = Math.max(winner.totalReservations || 0, loser.totalReservations || 0);
  set.totalEvents = Math.max(winner.totalEvents || 0, loser.totalEvents || 0);

  const tags = [...new Set([...(winner.tags || []), ...(loser.tags || [])])];
  if (tags.length) set.tags = tags;
  if (Object.keys(custom).length) set.customFields = custom;

  return set;
}

(async () => {
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const customers = client.db().collection('customers');

  const docs = await customers.find({ phone: { $exists: true, $ne: null } }).toArray();

  const groups = new Map();
  const invalid = [];
  let unchanged = 0;

  for (const doc of docs) {
    const raw = String(doc.phone ?? '').trim();
    if (!raw) continue;
    const phone = formatPhone(raw);
    if (!phone) {
      invalid.push(doc);
      continue;
    }
    if (phone === raw) unchanged++;
    const key = groupKey(doc, phone);
    if (!groups.has(key)) groups.set(key, { phone, docs: [] });
    groups.get(key).docs.push(doc);
  }

  const rewrites = [];
  const merges = [];

  for (const { phone, docs: group } of groups.values()) {
    group.sort((a, b) => score(b) - score(a) || (a.createdAt < b.createdAt ? -1 : 1));
    const [winner, ...losers] = group;

    if (losers.length) merges.push({ winner, losers, phone });
    else if (winner.phone !== phone) rewrites.push({ doc: winner, phone });
  }

  const duplicatesRemoved = merges.reduce((n, m) => n + m.losers.length, 0);
  const changedPhones =
    rewrites.length + merges.filter((m) => m.winner.phone !== m.phone).length;

  console.log(APPLY ? '── APLICANDO ──' : '── SIMULACIÓN (usa --apply para escribir) ──');
  console.log(`Contactos con teléfono ......... ${docs.length}`);
  console.log(`Ya en el formato correcto ...... ${unchanged}`);
  console.log(`Teléfonos a reescribir ......... ${changedPhones}`);
  console.log(`Duplicados a fusionar .......... ${duplicatesRemoved}`);
  console.log(`Teléfonos no aprovechables ..... ${invalid.length}`);

  const sample = (list, render) =>
    list.slice(0, 8).forEach((item) => console.log('   ' + render(item)));

  if (rewrites.length) {
    console.log('\nEjemplos de reescritura:');
    sample(rewrites, (r) => `${JSON.stringify(r.doc.phone)} → ${JSON.stringify(r.phone)}`);
  }
  if (merges.length) {
    console.log('\nEjemplos de fusión:');
    sample(merges, (m) =>
      `${m.phone} ← ${[m.winner, ...m.losers].map((d) => `${d.name} <${d.email || 's/email'}>`).join(' + ')}`,
    );
  }
  if (invalid.length) {
    console.log('\nTeléfonos que se van a limpiar (se guardan en customFields):');
    sample(invalid, (d) => `${d.name}: ${JSON.stringify(d.phone)}`);
  }

  if (!APPLY) {
    await client.close();
    console.log('\nNada escrito. Repite con --apply para aplicar.');
    return;
  }

  const ops = [];

  for (const { doc, phone } of rewrites) {
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { phone } } } });
  }

  for (const { winner, losers, phone } of merges) {
    let set = { phone };
    for (const loser of losers) set = { ...set, ...merge({ ...winner, ...set }, loser) };
    ops.push({ updateOne: { filter: { _id: winner._id }, update: { $set: set } } });
    ops.push({ deleteMany: { filter: { _id: { $in: losers.map((l) => l._id) } } } });
  }

  for (const doc of invalid) {
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $unset: { phone: '' },
          $set: { [`customFields.Teléfono sin formato`]: String(doc.phone) },
        },
      },
    });
  }

  if (ops.length) {
    // Ordenado: cada fusión escribe en el superviviente antes de borrar los suyos.
    const res = await customers.bulkWrite(ops, { ordered: true });
    console.log(`\nActualizados: ${res.modifiedCount} · Eliminados: ${res.deletedCount}`);
  } else {
    console.log('\nNo había nada que cambiar.');
  }

  await client.close();
})().catch((err) => {
  console.error('FALLÓ:', err);
  process.exit(1);
});
