import {
  compileEmail, createBlock, emptyDesign, fillSample, inlineMarkup, normalizeDesign, starterTemplates,
  EmailBlock, EmailDesign,
} from './email-design';

function design(...blocks: EmailBlock[]): EmailDesign {
  return { settings: {}, blocks };
}

function block(type: EmailBlock['type'], props: EmailBlock['props']): EmailBlock {
  return { ...createBlock(type), props: { ...createBlock(type).props, ...props } };
}

describe('compileEmail', () => {
  it('genera un documento completo de tablas con el preheader oculto', () => {
    const html = compileEmail(emptyDesign(), { subject: 'Hola', preheader: 'Mira esto' });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>Hola</title>');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('Mira esto');
    expect(html).toContain('display:none');
  });

  it('conserva las variables para que el backend las sustituya al enviar', () => {
    const html = compileEmail(design(block('text', { content: 'Hola {primer_nombre}' }), block('button', { label: 'Ir', href: '{link}' })));
    expect(html).toContain('Hola {primer_nombre}');
    expect(html).toContain('href="{link}"');
  });

  it('escapa el texto del usuario: no se puede inyectar marcado desde un bloque de texto', () => {
    const html = compileEmail(design(block('text', { content: '<script>alert(1)</script> & "x"' })));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
  });

  it('solo deja pasar destinos http(s), mailto, tel o una variable', () => {
    const html = compileEmail(
      design(
        block('button', { label: 'A', href: 'javascript:alert(1)' }),
        block('button', { label: 'B', href: 'tienda.com/oferta' }),
        block('button', { label: 'C', href: 'mailto:hola@x.com' }),
      ),
    );
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
    expect(html).toContain('href="https://tienda.com/oferta"');
    expect(html).toContain('href="mailto:hola@x.com"');
  });

  it('ignora colores que no son colores (no entran en el atributo style)', () => {
    const html = compileEmail({
      settings: { brandColor: 'red;background:url(x)' },
      blocks: [block('button', { label: 'Ir', href: 'https://x.com' })],
    });
    expect(html).not.toContain('url(x)');
    expect(html).toContain('#6d28d9');
  });

  it('el pie incluye el enlace de baja salvo que se desactive', () => {
    expect(compileEmail(design(block('footer', { text: 'Adiós' })))).toContain('href="{baja}"');
    expect(compileEmail(design(block('footer', { text: 'Adiós', showUnsubscribe: false })))).not.toContain('{baja}');
  });

  it('una imagen sin URL válida no se pinta', () => {
    expect(compileEmail(design(block('image', { src: '' })))).not.toContain('<img');
    expect(compileEmail(design(block('image', { src: 'https://cdn.x.com/a.png', alt: 'Foto' })))).toContain('alt="Foto"');
  });

  it('las columnas son apilables en móvil', () => {
    const html = compileEmail(design(block('columns', { items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] })));
    expect(html.match(/class="col"/g)).toHaveLength(3);
    expect(html).toContain('width="33%"');
  });

  it('el bloque HTML libre se inserta tal cual', () => {
    expect(compileEmail(design(block('html', { code: '<marquee>hola</marquee>' })))).toContain('<marquee>hola</marquee>');
  });
});

describe('inlineMarkup', () => {
  it('convierte negrita, cursiva y enlaces', () => {
    expect(inlineMarkup('**a** y *b* y [c](https://x.com)', '#000')).toBe(
      '<strong>a</strong> y <em>b</em> y <a href="https://x.com" style="color:#000;text-decoration:underline;">c</a>',
    );
  });
});

describe('normalizeDesign', () => {
  it('descarta bloques desconocidos y completa ids y propiedades', () => {
    const out = normalizeDesign({
      settings: {},
      blocks: [
        { type: 'text', props: { content: 'x' } } as unknown as EmailBlock,
        { type: 'video', props: {} } as unknown as EmailBlock,
      ],
    });
    expect(out.blocks).toHaveLength(1);
    expect(out.blocks[0].id).toBeTruthy();
    expect(out.blocks[0].props.size).toBe(16);
  });

  it('tolera un diseño vacío', () => {
    expect(normalizeDesign(null).blocks).toEqual([]);
  });
});

describe('fillSample', () => {
  it('sustituye las variables por sus ejemplos, escapados', () => {
    expect(fillSample('<p>{nombre}</p>', [{ token: '{nombre}', example: 'Ana <3' }])).toBe('<p>Ana &lt;3</p>');
  });
});

describe('starterTemplates', () => {
  it('todos los diseños de partida compilan y traen botón y baja', () => {
    for (const s of starterTemplates()) {
      const html = compileEmail(s.design, s);
      expect(html).toContain('{baja}');
      expect(html).toContain('{link}');
    }
  });
});
