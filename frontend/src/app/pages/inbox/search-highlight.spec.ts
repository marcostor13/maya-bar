import { highlightParts } from './search-highlight';

describe('highlightParts', () => {
  it('marca cada coincidencia sin distinguir mayúsculas y conserva el texto original', () => {
    expect(highlightParts('La Factura y otra factura', 'factura')).toEqual([
      { text: 'La ', hit: false },
      { text: 'Factura', hit: true },
      { text: ' y otra ', hit: false },
      { text: 'factura', hit: true },
    ]);
  });

  it('sin coincidencia devuelve el texto entero sin marcar', () => {
    expect(highlightParts('hola', 'adiós')).toEqual([{ text: 'hola', hit: false }]);
  });

  it('búsqueda vacía o texto vacío', () => {
    expect(highlightParts('hola', '  ')).toEqual([{ text: 'hola', hit: false }]);
    expect(highlightParts('', 'x')).toEqual([]);
  });
});
