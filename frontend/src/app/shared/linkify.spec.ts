import { linkify, type TextSegment } from './linkify';

const links = (s: TextSegment[]) => s.filter((x) => x.href);
const joined = (s: TextSegment[]) => s.map((x) => x.text).join('');

describe('linkify', () => {
  it('C1: una URL https con ruta y query es un link a esa URL', () => {
    const s = linkify('mira https://a.com/x?y=1&z=2#h');
    expect(s).toEqual([
      { text: 'mira ' },
      { text: 'https://a.com/x?y=1&z=2#h', href: 'https://a.com/x?y=1&z=2#h', external: true },
    ]);
  });

  it('C1: http y mayúsculas también', () => {
    expect(links(linkify('HTTP://Ejemplo.com'))).toEqual([
      { text: 'HTTP://Ejemplo.com', href: 'HTTP://Ejemplo.com', external: true },
    ]);
  });

  it('C2: www. sin esquema enlaza a https', () => {
    expect(linkify('entra a www.tienda.pe')).toEqual([
      { text: 'entra a ' },
      { text: 'www.tienda.pe', href: 'https://www.tienda.pe', external: true },
    ]);
  });

  it('C2: "www." suelto o sin dominio no es link', () => {
    expect(links(linkify('escribe www. o www.algo'))).toEqual([]);
  });

  it('C3: un correo es mailto y deja fuera el punto final', () => {
    expect(linkify('escribe a ventas@maya.pe.')).toEqual([
      { text: 'escribe a ' },
      { text: 'ventas@maya.pe', href: 'mailto:ventas@maya.pe', external: false },
      { text: '.' },
    ]);
  });

  it('C4: la puntuación y el paréntesis de la frase quedan fuera', () => {
    expect(links(linkify('(ver https://a.com/x).'))[0].href).toBe('https://a.com/x');
    expect(links(linkify('¿viste https://a.com?'))[0].href).toBe('https://a.com');
    expect(links(linkify('link: *https://a.com/p*'))[0].href).toBe('https://a.com/p');
    expect(links(linkify('"https://a.com/q", dijo'))[0].href).toBe('https://a.com/q');
  });

  it('C4: un paréntesis que es parte de la URL se conserva', () => {
    expect(links(linkify('https://es.wikipedia.org/wiki/A_(b)'))[0].href).toBe(
      'https://es.wikipedia.org/wiki/A_(b)',
    );
    expect(links(linkify('(https://es.wikipedia.org/wiki/A_(b))'))[0].href).toBe(
      'https://es.wikipedia.org/wiki/A_(b)',
    );
  });

  it('C5: varias URLs y saltos de línea: el texto queda idéntico', () => {
    const text = 'Hola,\n\npaga aquí: https://pay.me/abc.\nO en www.tienda.pe\ny escribe a a.b@c.co  gracias';
    const s = linkify(text);
    expect(joined(s)).toBe(text);
    expect(links(s).map((x) => x.href)).toEqual([
      'https://pay.me/abc',
      'https://www.tienda.pe',
      'mailto:a.b@c.co',
    ]);
  });

  it('C6: HTML, javascript: y data: no generan links', () => {
    const text = '<script>alert(1)</script> javascript:alert(1) data:text/html,x';
    const s = linkify(text);
    expect(links(s)).toEqual([]);
    expect(joined(s)).toBe(text);
  });

  it('C6: una URL no se extiende sobre < > ni comillas', () => {
    expect(links(linkify('<a href="https://a.com/x">y</a>'))[0].href).toBe('https://a.com/x');
  });

  it('no marca números, montos ni siglas', () => {
    expect(links(linkify('Pedido 1.234, total S/ 59.90, S.A.C. a las 3:45'))).toEqual([]);
  });

  it('texto vacío o nulo devuelve una lista vacía', () => {
    expect(linkify('')).toEqual([]);
    expect(linkify(null)).toEqual([]);
    expect(linkify(undefined)).toEqual([]);
  });

  it('un texto sin links queda en un solo trozo', () => {
    expect(linkify('hola qué tal')).toEqual([{ text: 'hola qué tal' }]);
  });
});
