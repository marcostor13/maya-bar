import { buildCsv } from './csv';

describe('buildCsv', () => {
  it('prefixes the content with the UTF-8 BOM', () => {
    const csv = buildCsv(['A'], []);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });

  it('quotes every cell and joins rows with CRLF', () => {
    const csv = buildCsv(['Nombre', 'Email'], [
      ['Ana', 'ana@test.com'],
      ['Luis', 'luis@test.com'],
    ]);
    expect(csv).toBe('\uFEFF"Nombre","Email"\r\n"Ana","ana@test.com"\r\n"Luis","luis@test.com"');
  });

  it('escapes double quotes by doubling them', () => {
    const csv = buildCsv(['Comentario'], [['Dijo "hola" dos veces']]);
    expect(csv).toContain('"Dijo ""hola"" dos veces"');
  });

  it('serializes numbers as strings', () => {
    const csv = buildCsv(['Personas', 'Precio'], [[4, 25.5]]);
    expect(csv).toContain('"4","25.5"');
  });

  it('keeps cells with commas inside their quotes (single row per record)', () => {
    const csv = buildCsv(['Opciones'], [['a, b, c']]);
    const lines = csv.split('\r\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).toBe('"a, b, c"');
  });

  it('returns only the header line when there are no rows', () => {
    const csv = buildCsv(['A', 'B'], []);
    expect(csv).toBe('\uFEFF"A","B"');
  });
});
