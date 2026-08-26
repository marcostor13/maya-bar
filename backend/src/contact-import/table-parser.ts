import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

/** Tabla normalizada: cabeceras + filas como objetos columna→valor. */
export interface ParsedTable {
  columns: string[];
  rows: Record<string, string>[];
}

/** Máximo de filas que se procesan de un archivo, para no comerse la memoria. */
export const MAX_ROWS = 20_000;

/**
 * Tope de columnas que se ofrecen al mapear. Una colección de Mongo puede tener
 * documentos heterogéneos y generar cientos de rutas; más de esto no cabe en la
 * pantalla de mapeo ni le sirve a nadie.
 */
export const MAX_COLUMNS = 200;

/** Profundidad de anidamiento que se aplana a rutas `a.b.c`. */
const MAX_DEPTH = 2;

/**
 * Parser de CSV con máquina de estados: respeta comillas dobles, comas y saltos
 * de línea dentro del campo, comillas escapadas ("") y BOM de Excel.
 */
export function parseCsv(text: string, delimiter?: string): ParsedTable {
  const clean = text.replace(/^﻿/, '');
  const sep = delimiter ?? detectDelimiter(clean);

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // \r\n cuenta como un solo salto.
      if (char === '\r' && clean[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      field = '';
      record = [];
    } else {
      field += char;
    }
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }

  return toTable(records);
}

/** Adivina el separador mirando la primera línea (coma, punto y coma o tab). */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t'].map((sep) => ({
    sep,
    count: firstLine.split(sep).length - 1,
  }));
  const best = counts.sort((a, b) => b.count - a.count)[0];
  return best.count > 0 ? best.sep : ',';
}

/** Lee la primera hoja de un .xlsx. */
export async function parseXlsx(buffer: Buffer): Promise<ParsedTable> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException(
      'No se pudo leer el Excel. Guárdalo como .xlsx o expórtalo a CSV.',
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('El Excel no tiene ninguna hoja');

  const records: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (records.length > MAX_ROWS) return;
    const values = row.values as unknown[];
    // ExcelJS deja el índice 0 vacío para alinear con las columnas 1..n.
    records.push(values.slice(1).map((v) => cellToString(v)));
  });

  return toTable(records);
}

/** Aplana los tipos que devuelve ExcelJS (fecha, fórmula, texto enriquecido…). */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().split('T')[0];
  if (typeof value === 'object') {
    const obj = value as {
      text?: string;
      result?: unknown;
      richText?: { text: string }[];
      hyperlink?: string;
    };
    if (obj.richText) return obj.richText.map((r) => r.text).join('');
    if (obj.text) return obj.text;
    if (obj.result !== undefined) return cellToString(obj.result);
    if (obj.hyperlink) return obj.hyperlink;
    return '';
  }
  return String(value);
}

/** Primera fila = cabeceras; el resto, objetos. Descarta filas vacías. */
function toTable(records: string[][]): ParsedTable {
  const [header, ...body] = records;
  if (!header?.length)
    throw new BadRequestException('El archivo está vacío o no tiene cabeceras');

  const columns = dedupeColumns(
    header.map((h, i) => h.trim() || `Columna ${i + 1}`),
  );

  const rows: Record<string, string>[] = [];
  for (const record of body) {
    if (rows.length >= MAX_ROWS) break;
    if (record.every((cell) => !cell?.trim())) continue;
    const row: Record<string, string> = {};
    columns.forEach((col, i) => {
      row[col] = (record[i] ?? '').trim();
    });
    rows.push(row);
  }

  return { columns, rows };
}

/** Excel admite cabeceras repetidas; aquí serían ambiguas al mapear. */
function dedupeColumns(columns: string[]): string[] {
  const seen = new Map<string, number>();
  return columns.map((col) => {
    const count = seen.get(col) ?? 0;
    seen.set(col, count + 1);
    return count === 0 ? col : `${col} (${count + 1})`;
  });
}

/* ==========================================================================
   JSON / NDJSON exportado desde MongoDB Compass o mongoexport
   ========================================================================== */

/**
 * Lee un volcado de colección de MongoDB. Admite las tres formas que salen de
 * Compass y de `mongoexport`:
 *   - array de documentos:      `[{...},{...}]`
 *   - un documento por línea:   `{...}\n{...}`  (NDJSON)
 *   - array envuelto en objeto: `{ "clientes": [ ... ] }`
 *
 * Los documentos se aplanan a rutas `a.b` y los tipos de Extended JSON
 * (`$oid`, `$date`, `$numberLong`…) se reducen a texto plano, que es lo que
 * espera el resto del importador.
 */
export function parseJson(text: string): ParsedTable {
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (!clean) throw new BadRequestException('El archivo JSON está vacío');

  const docs = toDocuments(clean);
  if (docs.length === 0)
    throw new BadRequestException('El JSON no contiene ningún documento');

  const columns: string[] = [];
  const seen = new Set<string>();
  const rows: Record<string, string>[] = [];

  for (const doc of docs) {
    if (rows.length >= MAX_ROWS) break;
    const flat = flattenDoc(doc);
    const row: Record<string, string> = {};
    for (const [path, value] of Object.entries(flat)) {
      const cell = valueToText(value);
      if (cell === '') continue;
      row[path] = cell;
      if (!seen.has(path) && columns.length < MAX_COLUMNS) {
        seen.add(path);
        columns.push(path);
      }
    }
    if (Object.keys(row).length) rows.push(row);
  }

  if (columns.length === 0)
    throw new BadRequestException(
      'Los documentos del JSON no tienen ningún campo con valor',
    );

  // Las filas se rellenan al final: una columna puede aparecer en el documento
  // 300 y las anteriores deben tenerla igualmente, aunque sea vacía.
  for (const row of rows) {
    for (const col of columns) if (!(col in row)) row[col] = '';
  }

  return { columns, rows };
}

/** Resuelve las tres formas de volcado a una lista plana de documentos. */
function toDocuments(text: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return parseNdjson(text);
  }

  if (Array.isArray(parsed)) return onlyObjects(parsed);

  if (isPlainRecord(parsed)) {
    // `{ "coleccion": [ ... ] }`: un único array dentro del objeto.
    const arrays = Object.values(parsed).filter(Array.isArray);
    if (arrays.length === 1) return onlyObjects(arrays[0]);
    return [parsed];
  }

  throw new BadRequestException(
    'El JSON debe ser un array de documentos o un documento por línea',
  );
}

/** Un documento por línea, tal como lo escribe `mongoexport` sin `--jsonArray`. */
function parseNdjson(text: string): Record<string, unknown>[] {
  const docs: Record<string, unknown>[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().replace(/,$/, '');
    if (!line || line === '[' || line === ']') continue;
    let doc: unknown;
    try {
      doc = JSON.parse(line);
    } catch {
      throw new BadRequestException(
        `El archivo no es un JSON válido (línea ${i + 1}). Expórtalo desde Compass como JSON.`,
      );
    }
    if (isPlainRecord(doc)) docs.push(doc);
    if (docs.length >= MAX_ROWS) break;
  }
  return docs;
}

function onlyObjects(items: unknown[]): Record<string, unknown>[] {
  return items.filter(isPlainRecord).slice(0, MAX_ROWS);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Aplana el documento a rutas `a.b`, resolviendo antes los envoltorios de
 * Extended JSON para que `{ "$oid": "..." }` no se convierta en la columna
 * `campo.$oid`.
 */
function flattenDoc(
  doc: Record<string, unknown>,
  prefix = '',
  depth = 0,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(doc)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = unwrapExtended(raw);
    if (isPlainRecord(value) && depth < MAX_DEPTH) {
      Object.assign(flat, flattenDoc(value, path, depth + 1));
    } else {
      flat[path] = value;
    }
  }
  return flat;
}

/**
 * Reduce los tipos de Extended JSON (modo relajado y canónico) al valor que
 * representan. Lo que no es un envoltorio conocido se devuelve intacto.
 */
function unwrapExtended(value: unknown): unknown {
  if (!isPlainRecord(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 0) return value;

  const wrapped = (key: string): unknown => value[key];

  if (keys.length === 1) {
    switch (keys[0]) {
      case '$oid':
      case '$symbol':
      case '$code':
        return wrapped(keys[0]);
      case '$numberInt':
      case '$numberLong':
      case '$numberDouble':
      case '$numberDecimal':
        return wrapped(keys[0]);
      case '$date': {
        // Relajado: string ISO. Canónico: `{ "$date": { "$numberLong": "ms" } }`,
        // que la llamada recursiva ya deja como string de dígitos.
        const inner = unwrapExtended(wrapped('$date'));
        if (typeof inner === 'number') return new Date(inner).toISOString();
        if (typeof inner !== 'string') return inner;
        // Los dos modos deben acabar en el mismo formato.
        const ms = /^-?\d+$/.test(inner) ? Number(inner) : Date.parse(inner);
        return Number.isNaN(ms) ? inner : new Date(ms).toISOString();
      }
      case '$timestamp': {
        const ts = wrapped('$timestamp');
        if (isPlainRecord(ts) && typeof ts['t'] === 'number')
          return new Date(ts['t'] * 1000).toISOString();
        return ts;
      }
      case '$minKey':
      case '$maxKey':
      case '$undefined':
        return '';
      case '$uuid':
        return wrapped('$uuid');
      case '$regularExpression': {
        const re = wrapped('$regularExpression');
        return isPlainRecord(re) ? String(re['pattern'] ?? '') : re;
      }
    }
  }

  if (keys.includes('$binary')) {
    const bin = wrapped('$binary');
    if (isPlainRecord(bin)) return String(bin['base64'] ?? '');
    return bin;
  }

  return value;
}

/** Aplana cualquier valor a la celda de texto que espera el importador. */
function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return value
      .map((item) => valueToText(unwrapExtended(item)))
      .filter(Boolean)
      .join(', ');
  if (typeof value === 'object') {
    // Objeto más profundo que MAX_DEPTH: se conserva legible en vez de perderlo.
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value).trim();
}
