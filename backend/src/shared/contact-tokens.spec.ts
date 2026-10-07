import {
  fillTokens,
  fillTokensHtml,
  fillTokensMultiline,
  unknownTokens,
  usesToken,
} from './contact-tokens';
import { smsSegments } from './sms-segments';

describe('contact-tokens', () => {
  const contact = {
    name: 'María  Pérez\nLópez',
    email: 'maria@correo.com',
    phone: '+51999888777',
    customFields: { Ciudad: 'Lima', puntos: 120 },
  };

  it('sustituye las variables del contacto y del envío', () => {
    expect(
      fillTokensMultiline(
        'Hola {primer_nombre}, {empresa} te espera: {link}',
        contact,
        {
          empresa: 'Maya',
          link: 'https://go.x/abc',
        },
      ),
    ).toBe('Hola María, Maya te espera: https://go.x/abc');
  });

  it('no distingue mayúsculas y resuelve campos personalizados', () => {
    expect(
      fillTokensMultiline('{NOMBRE} · {campo:ciudad} · {campo:Puntos}', {
        ...contact,
        name: 'Ana',
      }),
    ).toBe('Ana · Lima · 120');
  });

  it('un campo que no existe queda vacío, no rompe el texto', () => {
    expect(fillTokensMultiline('[{campo:inexistente}]', contact)).toBe('[]');
  });

  it('fillTokens aplana espacios y saltos (Meta los rechaza)', () => {
    expect(fillTokens('Hola {nombre}', contact)).toBe('Hola María Pérez López');
  });

  it('deja intacto lo que no es una variable conocida (CSS de un email)', () => {
    const css = 'a{color:red} .x{margin:0} {otra}';
    expect(fillTokensHtml(css, contact)).toBe(css);
  });

  it('escapa los valores al insertarlos en HTML', () => {
    expect(
      fillTokensHtml('<b>{nombre}</b>', { name: '<script>x</script> & "y"' }),
    ).toBe('<b>&lt;script&gt;x&lt;/script&gt; &amp; &quot;y&quot;</b>');
  });

  it('detecta variables mal escritas', () => {
    expect(unknownTokens('Hola {nombre} y {nonbre}, {campo:x}')).toEqual([
      '{nonbre}',
    ]);
  });

  it('usesToken', () => {
    expect(usesToken('mira {LINK}', 'link')).toBe(true);
    expect(usesToken('mira el link', 'link')).toBe(false);
  });
});

describe('smsSegments', () => {
  it('GSM-7: 160 en un segmento, 153 por parte si son varios', () => {
    expect(smsSegments('a'.repeat(160))).toMatchObject({
      encoding: 'GSM-7',
      segments: 1,
    });
    expect(smsSegments('a'.repeat(161))).toMatchObject({
      segments: 2,
      perSegment: 153,
    });
  });

  it('los caracteres extendidos cuentan doble', () => {
    expect(smsSegments('€[]').length).toBe(6);
  });

  it('un carácter fuera de GSM-7 fuerza UCS-2 (70 por segmento)', () => {
    const r = smsSegments('Promoción válida 🎉');
    expect(r.encoding).toBe('UCS-2');
    expect(r.unicodeChars).toEqual(expect.arrayContaining(['ó', '🎉']));
    expect(smsSegments('ó'.repeat(71)).segments).toBe(2);
  });

  it('las tildes habituales del español que sí están en GSM-7 no lo fuerzan', () => {
    expect(smsSegments('ñ é ¿Qué tal?').encoding).toBe('GSM-7');
  });

  it('texto vacío = 0 segmentos', () => {
    expect(smsSegments('').segments).toBe(0);
  });
});
