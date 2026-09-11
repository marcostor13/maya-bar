import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { parseCsv, parseJson, parseXlsx } from './table-parser';

describe('parseCsv', () => {
  it('lee cabeceras y filas', () => {
    const table = parseCsv(
      'nombre,email\nMarcos,marcos@bar.com\nAna,ana@bar.com',
    );
    expect(table.columns).toEqual(['nombre', 'email']);
    expect(table.rows).toEqual([
      { nombre: 'Marcos', email: 'marcos@bar.com' },
      { nombre: 'Ana', email: 'ana@bar.com' },
    ]);
  });

  it('respeta comas y saltos de línea dentro de comillas', () => {
    const table = parseCsv(
      'nombre,nota\n"Pérez, Marcos","Vino el lunes\ny pidió mesa"',
    );
    expect(table.rows[0]).toEqual({
      nombre: 'Pérez, Marcos',
      nota: 'Vino el lunes\ny pidió mesa',
    });
  });

  it('entiende las comillas escapadas', () => {
    const table = parseCsv('nombre\n"El ""Chino"""');
    expect(table.rows[0].nombre).toBe('El "Chino"');
  });

  it('quita el BOM que mete Excel', () => {
    const table = parseCsv('﻿nombre,email\nMarcos,m@bar.com');
    expect(table.columns[0]).toBe('nombre');
  });

  it('detecta el punto y coma como separador', () => {
    const table = parseCsv('nombre;telefono\nMarcos;51999888777');
    expect(table.columns).toEqual(['nombre', 'telefono']);
    expect(table.rows[0].telefono).toBe('51999888777');
  });

  it('soporta CRLF y descarta filas vacías', () => {
    const table = parseCsv('a,b\r\n1,2\r\n,\r\n3,4\r\n');
    expect(table.rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('desambigua cabeceras repetidas', () => {
    const table = parseCsv('tel,tel\n1,2');
    expect(table.columns).toEqual(['tel', 'tel (2)']);
    expect(table.rows[0]).toEqual({ tel: '1', 'tel (2)': '2' });
  });

  it('nombra las columnas sin cabecera', () => {
    const table = parseCsv('nombre,,email\nMarcos,x,m@bar.com');
    expect(table.columns).toEqual(['nombre', 'Columna 2', 'email']);
  });

  it('rechaza un archivo vacío', () => {
    expect(() => parseCsv('')).toThrow(BadRequestException);
  });
});

describe('parseXlsx', () => {
  async function buildWorkbook(rows: unknown[][]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Contactos');
    rows.forEach((row) => sheet.addRow(row));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  it('lee la primera hoja', async () => {
    const buffer = await buildWorkbook([
      ['Nombre', 'Teléfono'],
      ['Marcos', '51999888777'],
      ['Ana', '51988777666'],
    ]);
    const table = await parseXlsx(buffer);
    expect(table.columns).toEqual(['Nombre', 'Teléfono']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1]).toEqual({ Nombre: 'Ana', Teléfono: '51988777666' });
  });

  it('convierte números y fechas a texto', async () => {
    const buffer = await buildWorkbook([
      ['Telefono', 'Alta'],
      [51999888777, new Date('2026-01-15T00:00:00Z')],
    ]);
    const table = await parseXlsx(buffer);
    expect(table.rows[0].Telefono).toBe('51999888777');
    expect(table.rows[0].Alta).toBe('2026-01-15');
  });

  it('rechaza un archivo que no es xlsx', async () => {
    await expect(
      parseXlsx(Buffer.from('no soy un excel')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('parseJson', () => {
  it('lee un array de documentos exportado por Compass', () => {
    const table = parseJson(
      '[{"nombre":"Marcos","email":"marcos@bar.com"},{"nombre":"Ana","email":"ana@bar.com"}]',
    );
    expect(table.columns).toEqual(['nombre', 'email']);
    expect(table.rows).toEqual([
      { nombre: 'Marcos', email: 'marcos@bar.com' },
      { nombre: 'Ana', email: 'ana@bar.com' },
    ]);
  });

  it('lee NDJSON, un documento por línea', () => {
    const table = parseJson('{"nombre":"Marcos"}\n{"nombre":"Ana"}\n');
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1].nombre).toBe('Ana');
  });

  it('resuelve los envoltorios de Extended JSON', () => {
    const table = parseJson(
      JSON.stringify([
        {
          _id: { $oid: '6a8eec4e61da2007ceb310b8' },
          alta: { $date: '2026-01-15T10:00:00Z' },
          visitas: { $numberInt: '7' },
          gasto: { $numberDecimal: '150.50' },
        },
      ]),
    );
    expect(table.rows[0]._id).toBe('6a8eec4e61da2007ceb310b8');
    expect(table.rows[0].alta).toBe('2026-01-15T10:00:00.000Z');
    expect(table.rows[0].visitas).toBe('7');
    expect(table.rows[0].gasto).toBe('150.50');
  });

  it('resuelve la fecha en modo canónico', () => {
    const table = parseJson(
      '[{"alta":{"$date":{"$numberLong":"1768471200000"}}}]',
    );
    expect(table.rows[0].alta).toBe(new Date(1768471200000).toISOString());
  });

  it('aplana los objetos anidados a rutas con punto', () => {
    const table = parseJson(
      '[{"contacto":{"email":"a@bar.com","tel":{"movil":"51999888777"}}}]',
    );
    expect(table.columns).toEqual(['contacto.email', 'contacto.tel.movil']);
    expect(table.rows[0]['contacto.tel.movil']).toBe('51999888777');
  });

  it('une los arrays en una lista separada por comas', () => {
    const table = parseJson('[{"tags":["vip","fiel"]}]');
    expect(table.rows[0].tags).toBe('vip, fiel');
  });

  it('acepta el array envuelto en un objeto', () => {
    const table = parseJson('{"clientes":[{"nombre":"Marcos"}]}');
    expect(table.rows).toEqual([{ nombre: 'Marcos' }]);
  });

  it('rellena con vacío las columnas que solo trae un documento', () => {
    const table = parseJson(
      '[{"nombre":"Marcos"},{"nombre":"Ana","vip":true}]',
    );
    expect(table.columns).toEqual(['nombre', 'vip']);
    expect(table.rows[0].vip).toBe('');
    expect(table.rows[1].vip).toBe('true');
  });

  it('rechaza un archivo que no es JSON', () => {
    expect(() => parseJson('esto no es json')).toThrow(BadRequestException);
  });

  it('rechaza un JSON vacío', () => {
    expect(() => parseJson('[]')).toThrow(BadRequestException);
  });
});
