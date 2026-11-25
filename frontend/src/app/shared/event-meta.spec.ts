import { eventMeta, injectMeta, plain } from './event-meta';

const SHELL = `<!doctype html><html><head>
  <title>Maya CRM — CRM de ventas</title>
  <meta name="description" content="Capta contactos">
  <meta property="og:title" content="Maya">
</head><body></body></html>`;

describe('Vista previa de enlaces de eventos', () => {
  const data = {
    event: {
      title: 'Taller de ventas "Pro"',
      description: '<p>Aprende a <b>vender</b> por WhatsApp.</p>',
      date: '2026-12-05T00:00:00.000Z',
      startTime: '19:00',
      location: 'Miraflores, Lima',
      imageUrl: 'https://cdn.test/portada.jpg',
    },
    brand: { name: 'Acme', logo: 'https://cdn.test/logo.png' },
  };

  it('arma título, descripción con fecha y lugar, imagen y URL del evento', () => {
    const m = eventMeta(data, 'https://mayacrm.site/e/taller', 'https://mayacrm.site');
    expect(m.title).toBe('Taller de ventas "Pro"');
    expect(m.description).toContain('19:00');
    expect(m.description).toContain('Miraflores, Lima');
    expect(m.description).toContain('Aprende a vender por WhatsApp.');
    expect(m.description).not.toContain('<');
    expect(m.image).toBe('https://cdn.test/portada.jpg');
    expect(m.siteName).toBe('Acme');
    expect(m.largeImage).toBe(true);
  });

  it('sin portada usa el logo de la marca; sin marca, el ícono de Maya', () => {
    const noCover = { ...data, event: { ...data.event, imageUrl: undefined } };
    expect(eventMeta(noCover, 'u', 'https://mayacrm.site').image).toBe('https://cdn.test/logo.png');
    expect(eventMeta({ event: noCover.event }, 'u', 'https://mayacrm.site').image).toBe('https://mayacrm.site/icons/icon-512.png');
    expect(eventMeta(noCover, 'u', 'https://mayacrm.site').largeImage).toBe(false);
    const bg = { event: { ...noCover.event, invitationDesign: { background: { type: 'image', url: 'https://cdn.test/fondo.jpg' } } } };
    expect(eventMeta(bg, 'u', 'https://mayacrm.site').image).toBe('https://cdn.test/fondo.jpg');
  });

  it('reemplaza título y descripción, quita las og de Maya y escapa comillas', () => {
    const html = injectMeta(SHELL, eventMeta(data, 'https://mayacrm.site/e/taller', 'https://mayacrm.site'));
    expect(html).toContain('<title>Taller de ventas &quot;Pro&quot;</title>');
    expect(html).not.toContain('Capta contactos');
    expect(html).not.toContain('content="Maya"');
    expect(html).toContain('<meta property="og:title" content="Taller de ventas &quot;Pro&quot;">');
    expect(html).toContain('<meta property="og:image" content="https://cdn.test/portada.jpg">');
    expect(html).toContain('<meta property="og:url" content="https://mayacrm.site/e/taller">');
    expect(html.match(/og:title/g)).toHaveLength(1);
  });

  it('plain recorta textos largos', () => {
    expect(plain('a'.repeat(300), 10)).toHaveLength(10);
  });
});
