import {
  assertPublicUrl,
  domainOf,
  hunterDomainSearch,
  isPrivateAddress,
  placesTextSearch,
  runPageSpeed,
  scrapeWebsite,
  serperSearch,
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

describe('prospecting-sources: red y APIs', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  /** Respuesta mínima compatible con lo que usan las fuentes. */
  function response(
    body: string | object,
    init: { status?: number; headers?: Record<string, string> } = {},
  ): Response {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(
      init.status && init.status >= 300 && init.status < 400 ? null : text,
      {
        status: init.status ?? 200,
        headers: init.headers ?? { 'content-type': 'application/json' },
      },
    );
  }

  it('reconoce direcciones privadas, locales y de metadatos', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ])
      expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of [
      '8.8.8.8',
      '93.184.216.34',
      '172.32.0.1',
      '2606:4700::1111',
    ])
      expect(isPrivateAddress(ip)).toBe(false);
  });

  it('rechaza URLs internas o con otro protocolo', async () => {
    await expect(assertPublicUrl('http://127.0.0.1:27017')).rejects.toThrow(
      'no es pública',
    );
    await expect(assertPublicUrl('http://[::1]/')).rejects.toThrow(
      'no es pública',
    );
    await expect(
      assertPublicUrl('http://169.254.169.254/latest/meta-data'),
    ).rejects.toThrow();
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow('http');
    await expect(
      assertPublicUrl('https://93.184.216.34/'),
    ).resolves.toBeInstanceOf(URL);
  });

  it('no se rompe con un tel: mal codificado', () => {
    expect(extractPhones('<a href="tel:+51%ZZ987654321">x</a>')).toEqual([
      '+51987654321',
    ]);
  });

  it('no sigue una redirección hacia la red interna', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response('', {
        status: 302,
        headers: { location: 'http://127.0.0.1/admin' },
      }),
    );
    const report = await scrapeWebsite('http://93.184.216.34/');
    expect(report.reachable).toBe(false);
    expect(report.error).toContain('no es pública');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('analiza portada y páginas clave de una web pública', async () => {
    const home = `<html lang="es"><head><title>Acme</title>
      <meta name="viewport" content="width=device-width">
      <meta name="description" content="Contadores en Lima">
      <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC"></script>
      </head><body><h1>Acme</h1><img src="a.png"><img src="b.png" alt="b">
      <a href="/contacto">Contacto</a> <a href="https://instagram.com/acme">ig</a>
      © 2024 Acme</body></html>`;
    const contact = `<html><body><a href="mailto:hola@acme.pe">hola@acme.pe</a>
      <a href="tel:+5112345678">tel</a>
      <form><input name="email"><textarea name="mensaje"></textarea></form></body></html>`;
    global.fetch = jest.fn((url: string) =>
      Promise.resolve(
        response(url.endsWith('/contacto') ? contact : home, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      ),
    ) as never;

    const r = await scrapeWebsite('http://93.184.216.34/');
    expect(r.reachable).toBe(true);
    expect(r.title).toBe('Acme');
    expect(r.description).toBe('Contadores en Lima');
    expect(r.hasViewport).toBe(true);
    expect(r.h1Count).toBe(1);
    expect(r.imagesWithoutAlt).toBe(1);
    expect(r.copyrightYear).toBe(2024);
    expect(r.technologies).toContain('Google Tag Manager');
    expect(r.hasContactForm).toBe(true);
    expect(r.hasEcommerce).toBe(false);
    expect(r.emails).toEqual(['hola@acme.pe']);
    expect(r.phones).toEqual(['+5112345678']);
    expect(r.social.map((s) => s.network)).toEqual(['instagram']);
    expect(r.pagesVisited).toEqual([
      'http://93.184.216.34/',
      'http://93.184.216.34/contacto',
    ]);
  });

  it('lee PageSpeed y reintenta sin key si la key no tiene la API', async () => {
    const psBody = {
      lighthouseResult: {
        categories: {
          performance: { score: 0.34 },
          seo: { score: 0.9 },
          accessibility: { score: 0.71 },
          'best-practices': { score: 1 },
        },
        audits: {
          'largest-contentful-paint': { displayValue: '6,2 s' },
          'unused-javascript': {
            title: 'Reduce el JavaScript',
            score: 0.2,
            displayValue: '1,2 s',
            details: { type: 'opportunity', overallSavingsMs: 1200 },
          },
          'ok-audit': {
            title: 'Bien',
            score: 1,
            details: { type: 'opportunity' },
          },
        },
      },
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        response({ error: { message: 'API not enabled' } }, { status: 403 }),
      )
      .mockResolvedValueOnce(response(psBody));
    global.fetch = fetchMock as never;

    const r = await runPageSpeed('https://acme.pe', 'mobile', 'KEY');
    expect(r).toMatchObject({
      performance: 34,
      seo: 90,
      accessibility: 71,
      bestPractices: 100,
    });
    expect(r.metrics.LCP).toBe('6,2 s');
    expect(r.opportunities).toEqual([
      { title: 'Reduce el JavaScript', savings: '1,2 s' },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('key=KEY');
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('key=');
  });

  it('propaga el error de PageSpeed que no es de permisos', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        response({ error: { message: 'boom' } }, { status: 500 }),
      ) as never;
    await expect(
      runPageSpeed('https://acme.pe', 'mobile', 'KEY'),
    ).rejects.toThrow('PageSpeed 500: boom');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('mapea Google Places y descarta negocios cerrados', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response({
        places: [
          {
            id: 'p1',
            displayName: { text: 'Acme' },
            formattedAddress: 'Lima',
            internationalPhoneNumber: '+51 1 234',
            websiteUri: 'https://acme.pe',
            rating: 4.5,
            userRatingCount: 10,
            googleMapsUri: 'https://maps/p1',
            primaryTypeDisplayName: { text: 'Contador' },
          },
          {
            id: 'p2',
            displayName: { text: 'Cerrado' },
            businessStatus: 'CLOSED_PERMANENTLY',
          },
        ],
      }),
    ) as never;
    const res = await placesTextSearch('contadores en Lima', 'KEY');
    expect(res).toEqual([
      expect.objectContaining({
        placeId: 'p1',
        name: 'Acme',
        phone: '+51 1 234',
        category: 'Contador',
        source: 'google_places',
      }),
    ]);
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe(
      'KEY',
    );
  });

  it('separa personas y correos genéricos de Hunter', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response({
        data: {
          emails: [
            {
              value: 'ana@acme.pe',
              type: 'personal',
              first_name: 'Ana',
              last_name: 'Ruiz',
              position: 'CEO',
              confidence: 95,
            },
            { value: 'info@acme.pe', type: 'generic' },
          ],
        },
      }),
    ) as never;
    const r = await hunterDomainSearch('acme.pe', 'KEY');
    expect(r.people).toEqual([
      {
        name: 'Ana Ruiz',
        role: 'CEO',
        email: 'ana@acme.pe',
        phone: undefined,
        linkedin: undefined,
        confidence: 95,
      },
    ]);
    expect(r.genericEmails).toEqual(['info@acme.pe']);
  });

  it('muestra el mensaje de error de la API', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        response({ message: 'Invalid API key' }, { status: 401 }),
      ) as never;
    await expect(serperSearch('x', 'bad')).rejects.toThrow(
      'Serper 401: Invalid API key',
    );
  });
});
