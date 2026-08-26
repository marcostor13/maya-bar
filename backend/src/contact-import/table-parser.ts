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
