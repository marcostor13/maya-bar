import {
  domainOf,
  extractEmails,
  extractPhones,
  extractSocial,
  keyPageLinks,
  normalizeUrl,
  parsePage,
} from './prospecting-sources';

describe('prospecting-sources', () => {
  it('normaliza URLs y descarta redes como dominio propio', () => {
    expect(normalizeUrl('acme.pe')).toBe('https://acme.pe/');
    expect(normalizeUrl('localhost')).toBeUndefined();
    expect(domainOf('https://www.acme.pe/contacto')).toBe('acme.pe');
    expect(domainOf('https://facebook.com/acme')).toBeUndefined();
    expect(domainOf('https://m.facebook.com/acme')).toBeUndefined();
  });

  it('extrae perfiles sociales sin enlaces de compartir', () => {
    const html = `
      <a href="https://www.facebook.com/acmeperu/">fb</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
      <a href="https://instagram.com/acme.pe">ig</a>
      <a href="https://www.linkedin.com/company/acme-sac">in</a>
      <a href="https://wa.me/51987654321">wa</a>`;
    const social = extractSocial(html);
    expect(social.map((s) => s.network)).toEqual([
      'facebook',
      'instagram',
      'linkedin',
      'whatsapp',
    ]);
    expect(social[0].url).toBe('https://www.facebook.com/acmeperu');
  });

  it('extrae correos reales y teléfonos explícitos', () => {
    const html = `<a href="mailto:ventas@acme.pe">x</a> logo@2x.png info@acme.pe
      <a href="tel:+51 1 234-5678">call</a> <a href="https://wa.me/51987654321">wa</a>`;
    expect(extractEmails(html)).toEqual(['ventas@acme.pe', 'info@acme.pe']);
    expect(extractPhones(html)).toEqual(['+5112345678', '+51987654321']);
  });

  it('encuentra páginas internas clave del mismo dominio', () => {
    const html = `
      <a href="/nosotros">a</a><a href="/contacto#form">b</a>
      <a href="https://otro.com/contacto">c</a><a href="/blog/post">d</a>
      <a href="mailto:x@acme.pe">e</a>`;
    expect(keyPageLinks(html, 'https://acme.pe/')).toEqual([
      'https://acme.pe/nosotros',
      'https://acme.pe/contacto',
    ]);
  });

  it('lee título, descripción y texto sin scripts', () => {
    const page = parsePage(
      'https://acme.pe',
      `<html><head><title>Acme &amp; Co</title>
       <meta name="description" content="Servicios contables"></head>
       <body><script>var x=1</script><h1>Hola</h1> mundo</body></html>`,
    );
    expect(page.title).toBe('Acme & Co');
    expect(page.description).toBe('Servicios contables');
    expect(page.text).toBe('Acme & Co Hola mundo');
  });
});
