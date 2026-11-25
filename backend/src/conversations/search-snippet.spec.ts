import { escapeRegex, searchSnippet } from './search-snippet';

describe('searchSnippet', () => {
  it('un texto corto se devuelve entero, sin saltos de línea', () => {
    expect(searchSnippet('Hola,\n  quiero la factura', 'factura')).toBe(
      'Hola, quiero la factura',
    );
  });

  it('recorta alrededor de la coincidencia, sin distinguir mayúsculas', () => {
    const text = `${'a'.repeat(200)} aquí va la FACTURA del pedido ${'b'.repeat(200)}`;
    const s = searchSnippet(text, 'factura');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s).toContain('FACTURA');
    expect(s.length).toBeLessThanOrEqual(92);
  });

  it('una coincidencia al principio no lleva "…" delante', () => {
    const s = searchSnippet(`factura ${'x'.repeat(200)}`, 'factura');
    expect(s.startsWith('factura')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
  });

  it('una coincidencia al final no lleva "…" detrás', () => {
    const s = searchSnippet(`${'x'.repeat(200)} factura`, 'factura');
    expect(s.endsWith('factura')).toBe(true);
    expect(s.startsWith('…')).toBe(true);
  });

  it('escapeRegex deja literales los caracteres especiales', () => {
    expect(new RegExp(escapeRegex('.*(')).test('abc')).toBe(false);
    expect(new RegExp(escapeRegex('.*(')).test('x.*(y')).toBe(true);
  });
});
