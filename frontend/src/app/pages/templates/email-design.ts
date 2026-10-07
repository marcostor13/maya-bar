/**
 * Modelo del constructor de emails por bloques y su compilador a HTML.
 *
 * El HTML resultante es de tablas con estilos en línea, que es lo único que
 * pintan de forma fiable Gmail, Outlook y compañía. Los colores de este
 * archivo son contenido del email (lo elige el usuario), no estilos de la app.
 */

export type EmailBlockType =
  | 'header'
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'columns'
  | 'footer'
  | 'html';

export type Align = 'left' | 'center' | 'right';

export interface ColumnItem {
  image?: string;
  title?: string;
  text?: string;
  buttonLabel?: string;
  buttonHref?: string;
}

/** Todas las propiedades posibles; cada tipo de bloque usa las suyas. */
export interface BlockProps {
  title?: string;
  subtitle?: string;
  logoUrl?: string;
  align?: Align;
  bg?: string;
  color?: string;
  content?: string;
  size?: number;
  heading?: 'p' | 'h1' | 'h2';
  src?: string;
  alt?: string;
  href?: string;
  width?: number;
  radius?: number;
  label?: string;
  full?: boolean;
  thickness?: number;
  height?: number;
  items?: ColumnItem[];
  text?: string;
  address?: string;
  showUnsubscribe?: boolean;
  code?: string;
}

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  props: BlockProps;
}

export interface EmailSettings {
  bg: string;
  contentBg: string;
  width: number;
  font: string;
  textColor: string;
  brandColor: string;
  radius: number;
  padding: number;
}

export interface EmailDesign {
  settings: Partial<EmailSettings>;
  blocks: EmailBlock[];
}

export const DEFAULT_SETTINGS: EmailSettings = {
  bg: '#f3f4f6',
  contentBg: '#ffffff',
  width: 600,
  font: 'Arial, Helvetica, sans-serif',
  textColor: '#1f2937',
  brandColor: '#6d28d9',
  radius: 16,
  padding: 32,
};

export const FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, Times, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Trebuchet', value: "'Trebuchet MS', Arial, sans-serif" },
  { label: 'Courier', value: "'Courier New', Courier, monospace" },
];

export const BLOCK_LABELS: Record<EmailBlockType, string> = {
  header: 'Cabecera',
  text: 'Texto',
  image: 'Imagen',
  button: 'Botón',
  divider: 'Divisor',
  spacer: 'Espacio',
  columns: 'Columnas',
  footer: 'Pie',
  html: 'HTML libre',
};

let counter = 0;
export function newId(): string {
  counter += 1;
  return 'b' + Date.now().toString(36) + counter.toString(36);
}

/** Bloque nuevo con valores por defecto razonables. */
export function createBlock(type: EmailBlockType): EmailBlock {
  const props: Record<EmailBlockType, BlockProps> = {
    header: { title: 'Título del correo', subtitle: '', align: 'center', color: '#ffffff' },
    text: { content: 'Hola {primer_nombre},\n\nEscribe aquí tu mensaje.', size: 16, align: 'left', heading: 'p' },
    image: { src: '', alt: '', width: 100, align: 'center', radius: 8 },
    button: { label: 'Ver más', href: '{link}', align: 'center', color: '#ffffff', radius: 999, full: false },
    divider: { color: '#e5e7eb', thickness: 1 },
    spacer: { height: 24 },
    columns: {
      items: [
        { title: 'Primer punto', text: 'Describe el beneficio.' },
        { title: 'Segundo punto', text: 'Describe el beneficio.' },
      ],
    },
    footer: { text: 'Gracias por ser parte de {empresa}.', address: '', showUnsubscribe: true, color: '#6b7280' },
    html: { code: '<p style="margin:0;">Tu HTML aquí</p>' },
  };
  return { id: newId(), type, props: { ...props[type] } };
}

export function emptyDesign(): EmailDesign {
  return { settings: {}, blocks: [createBlock('header'), createBlock('text'), createBlock('button'), createBlock('footer')] };
}

/** La IA y las plantillas viejas pueden traer bloques sin id o sin props. */
export function normalizeDesign(design: EmailDesign | undefined | null): EmailDesign {
  const blocks = (design?.blocks ?? [])
    .filter(b => b && typeof b === 'object' && b.type in BLOCK_LABELS)
    .map(b => ({
      id: b.id || newId(),
      type: b.type,
      props: { ...createBlock(b.type).props, ...(b.props ?? {}) },
    }));
  return { settings: { ...(design?.settings ?? {}) }, blocks };
}

// ───────────────────────── Compilador ─────────────────────────

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Solo colores con forma de color: lo demás no entra en un atributo style. */
function color(value: unknown, fallback: string): string {
  const v = String(value ?? '').trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) || /^(rgb|hsl)a?\([\d\s.,%]+\)$/i.test(v) ? v : fallback;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Destinos admitidos: web, correo, teléfono o una variable ({link}, {baja}). */
function href(value: unknown): string {
  const v = String(value ?? '').trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v) || /^\{[a-z_:]+\}$/i.test(v)) return esc(v);
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return esc('https://' + v);
  return '#';
}

function imgSrc(value: unknown): string {
  const v = String(value ?? '').trim();
  return /^https?:\/\//i.test(v) ? esc(v) : '';
}

/** Texto plano con **negrita**, *cursiva* y [texto](url) a HTML en línea. */
export function inlineMarkup(text: string, linkColor: string): string {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => {
      const target = href(url.replace(/&amp;/g, '&'));
      return '<a href="' + target + '" style="color:' + linkColor + ';text-decoration:underline;">' + label + '</a>';
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

function paragraphs(text: string, style: string, linkColor: string, tag = 'p'): string {
  return String(text ?? '')
    .split(/\n{2,}/)
    .filter(p => p.trim())
    .map(p => '<' + tag + ' style="' + style + '">' + inlineMarkup(p.trim(), linkColor).replace(/\n/g, '<br>') + '</' + tag + '>')
    .join('');
}

function buttonHtml(label: string, target: string, bg: string, fg: string, radius: number, full: boolean): string {
  return (
    '<a href="' + target + '" style="display:' + (full ? 'block' : 'inline-block') +
    ';background:' + bg + ';color:' + fg + ';text-decoration:none;font-weight:bold;font-size:16px;' +
    'padding:14px 28px;border-radius:' + radius + 'px;text-align:center;">' + esc(label) + '</a>'
  );
}

function row(inner: string, padding: string, extra = ''): string {
  return '<tr><td style="padding:' + padding + ';' + extra + '">' + inner + '</td></tr>';
}

function renderBlock(b: EmailBlock, s: EmailSettings): string {
  const p = b.props;
  const pad = s.padding;
  const align = (p.align ?? 'left') as Align;
  switch (b.type) {
    case 'header': {
      const bg = color(p.bg, s.brandColor);
      const fg = color(p.color, '#ffffff');
      const logo = imgSrc(p.logoUrl);
      return row(
        (logo ? '<img src="' + logo + '" alt="" height="48" style="height:48px;width:auto;margin-bottom:16px;border:0;">' : '') +
          '<h1 style="margin:0;font-size:28px;line-height:1.25;color:' + fg + ';">' + inlineMarkup(p.title ?? '', fg) + '</h1>' +
          (p.subtitle ? '<p style="margin:10px 0 0;font-size:16px;line-height:1.5;color:' + fg + ';opacity:.9;">' + inlineMarkup(p.subtitle, fg) + '</p>' : ''),
        (pad + 8) + 'px ' + pad + 'px',
        'background:' + bg + ';text-align:' + (p.align ?? 'center') + ';',
      );
    }
    case 'text': {
      const size = num(p.size, 16, 10, 48);
      const fg = color(p.color, s.textColor);
      const heading = p.heading ?? 'p';
      const scale = heading === 'h1' ? 1.75 : heading === 'h2' ? 1.35 : 1;
      const style =
        'margin:0 0 14px;font-size:' + Math.round(size * scale) + 'px;line-height:1.6;color:' + fg +
        ';text-align:' + align + ';' + (heading === 'p' ? '' : 'font-weight:bold;');
      return row(paragraphs(p.content ?? '', style, s.brandColor, heading), '12px ' + pad + 'px 0');
    }
    case 'image': {
      const src = imgSrc(p.src);
      if (!src) return '';
      const width = num(p.width, 100, 10, 100);
      const img =
        '<img src="' + src + '" alt="' + esc(p.alt) + '" width="' + Math.round(((s.width - pad * 2) * width) / 100) +
        '" style="width:' + width + '%;max-width:100%;height:auto;border:0;border-radius:' + num(p.radius, 8, 0, 60) + 'px;display:inline-block;">';
      return row(p.href ? '<a href="' + href(p.href) + '">' + img + '</a>' : img, '12px ' + pad + 'px', 'text-align:' + (p.align ?? 'center') + ';');
    }
    case 'button':
      return row(
        buttonHtml(p.label ?? '', href(p.href), color(p.bg, s.brandColor), color(p.color, '#ffffff'), num(p.radius, 999, 0, 999), !!p.full),
        '16px ' + pad + 'px',
        'text-align:' + (p.align ?? 'center') + ';',
      );
    case 'divider':
      return row(
        '<div style="border-top:' + num(p.thickness, 1, 1, 12) + 'px solid ' + color(p.color, '#e5e7eb') + ';font-size:0;line-height:0;">&nbsp;</div>',
        '16px ' + pad + 'px',
      );
    case 'spacer':
      return row('&nbsp;', '0', 'height:' + num(p.height, 24, 4, 200) + 'px;font-size:0;line-height:0;');
    case 'columns': {
      const items = (p.items ?? []).slice(0, 3);
      if (!items.length) return '';
      const w = Math.floor(100 / items.length);
      const cells = items
        .map(it => {
          const img = imgSrc(it.image);
          return (
            '<td class="col" width="' + w + '%" valign="top" style="padding:8px;width:' + w + '%;">' +
            (img ? '<img src="' + img + '" alt="" style="width:100%;height:auto;border:0;border-radius:8px;margin-bottom:10px;">' : '') +
            (it.title ? '<p style="margin:0 0 6px;font-size:17px;font-weight:bold;color:' + s.textColor + ';">' + inlineMarkup(it.title, s.brandColor) + '</p>' : '') +
            (it.text ? '<p style="margin:0 0 10px;font-size:14px;line-height:1.55;color:' + s.textColor + ';">' + inlineMarkup(it.text, s.brandColor).replace(/\n/g, '<br>') + '</p>' : '') +
            (it.buttonLabel ? buttonHtml(it.buttonLabel, href(it.buttonHref), s.brandColor, '#ffffff', 999, false).replace('padding:14px 28px', 'padding:10px 18px').replace('font-size:16px', 'font-size:14px') : '') +
            '</td>'
          );
        })
        .join('');
      return row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' + cells + '</tr></table>', '8px ' + (pad - 8) + 'px');
    }
    case 'footer': {
      const fg = color(p.color, '#6b7280');
      const style = 'margin:0 0 6px;font-size:13px;line-height:1.5;color:' + fg + ';';
      return row(
        (p.text ? '<p style="' + style + '">' + inlineMarkup(p.text, fg) + '</p>' : '') +
          (p.address ? '<p style="' + style + '">' + inlineMarkup(p.address, fg) + '</p>' : '') +
          (p.showUnsubscribe !== false
            ? '<p style="' + style + '"><a href="{baja}" style="color:' + fg + ';text-decoration:underline;">Darme de baja</a></p>'
            : ''),
        '24px ' + pad + 'px ' + pad + 'px',
        'text-align:center;',
      );
    }
    case 'html':
      return row(String(p.code ?? ''), '8px ' + pad + 'px');
  }
}

/** Compila el diseño a un documento HTML completo listo para enviar. */
export function compileEmail(design: EmailDesign, meta: { subject?: string; preheader?: string } = {}): string {
  const s: EmailSettings = { ...DEFAULT_SETTINGS, ...design.settings };
  s.width = num(s.width, 600, 320, 800);
  s.padding = num(s.padding, 32, 8, 64);
  s.radius = num(s.radius, 16, 0, 40);
  s.bg = color(s.bg, DEFAULT_SETTINGS.bg);
  s.contentBg = color(s.contentBg, DEFAULT_SETTINGS.contentBg);
  s.textColor = color(s.textColor, DEFAULT_SETTINGS.textColor);
  s.brandColor = color(s.brandColor, DEFAULT_SETTINGS.brandColor);
  const font = FONT_OPTIONS.some(f => f.value === s.font) ? s.font : DEFAULT_SETTINGS.font;

  const rows = design.blocks.map(b => renderBlock(b, s)).join('\n');
  const preheader = meta.preheader
    ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + esc(meta.preheader) + '</div>'
    : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + esc(meta.subject ?? '') + '</title>',
    '<style>',
    'body{margin:0;padding:0;}',
    'img{max-width:100%;}',
    '@media only screen and (max-width:620px){',
    '.container{width:100% !important;border-radius:0 !important;}',
    '.col{display:block !important;width:100% !important;box-sizing:border-box;}',
    '}',
    '</style>',
    '</head>',
    '<body style="margin:0;padding:0;background:' + s.bg + ';">',
    preheader,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + s.bg + ';">',
    '<tr><td align="center" style="padding:24px 12px;">',
    '<table role="presentation" class="container" width="' + s.width + '" cellpadding="0" cellspacing="0" border="0" style="width:' + s.width +
      'px;max-width:100%;background:' + s.contentBg + ';border-radius:' + s.radius + 'px;overflow:hidden;font-family:' + font + ';color:' + s.textColor + ';">',
    rows,
    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('\n');
}

/** Sustituye las variables por sus valores de muestra, para la vista previa. */
export function fillSample(html: string, variables: { token: string; example: string }[]): string {
  let out = html;
  for (const v of variables) {
    const safe = v.example.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    out = out.split(v.token).join(safe);
  }
  return out;
}

// ───────────────────────── Galería de partida ─────────────────────────

export interface StarterTemplate {
  key: string;
  name: string;
  description: string;
  subject: string;
  preheader: string;
  design: EmailDesign;
}

function block(type: EmailBlockType, props: BlockProps): EmailBlock {
  return { id: newId(), type, props: { ...createBlock(type).props, ...props } };
}

export function starterTemplates(): StarterTemplate[] {
  return [
    {
      key: 'promo',
      name: 'Promoción',
      description: 'Oferta con un botón claro y tres beneficios.',
      subject: '{primer_nombre}, esto es para ti',
      preheader: 'Una oferta pensada para ti, por tiempo limitado.',
      design: {
        settings: { brandColor: '#6d28d9' },
        blocks: [
          block('header', { title: 'Una oferta para ti', subtitle: 'Solo por tiempo limitado' }),
          block('text', { content: 'Hola {primer_nombre},\n\nQueremos agradecerte con una promoción especial. **Aprovéchala antes de que termine.**' }),
          block('button', { label: 'Quiero la oferta', href: '{link}' }),
          block('columns', {
            items: [
              { title: 'Rápido', text: 'Actívala en menos de un minuto.' },
              { title: 'Sin letra pequeña', text: 'Lo que ves es lo que obtienes.' },
              { title: 'Soporte real', text: 'Te acompañamos en todo momento.' },
            ],
          }),
          block('footer', { text: 'Con cariño, el equipo de {empresa}.' }),
        ],
      },
    },
    {
      key: 'newsletter',
      name: 'Boletín',
      description: 'Novedades con titular, texto e imagen.',
      subject: 'Novedades de {empresa}',
      preheader: 'Lo más importante de este mes, en dos minutos.',
      design: {
        settings: { brandColor: '#0f766e' },
        blocks: [
          block('header', { title: 'Novedades del mes', subtitle: '{empresa}' }),
          block('text', { content: 'Lo más destacado', heading: 'h2' }),
          block('text', { content: 'Hola {primer_nombre},\n\nTe contamos en pocas líneas lo que ha pasado y lo que viene.' }),
          block('divider', {}),
          block('text', { content: 'Segunda noticia', heading: 'h2' }),
          block('text', { content: 'Un párrafo breve con el contexto y un [enlace para leer más]({link}).' }),
          block('button', { label: 'Leer todo', href: '{link}' }),
          block('footer', { text: 'Recibes este correo porque eres parte de {empresa}.' }),
        ],
      },
    },
    {
      key: 'welcome',
      name: 'Bienvenida',
      description: 'Primer contacto con los siguientes pasos.',
      subject: 'Bienvenido a {empresa}, {primer_nombre}',
      preheader: 'Gracias por unirte. Esto es lo que sigue.',
      design: {
        settings: { brandColor: '#2563eb' },
        blocks: [
          block('header', { title: 'Bienvenido', subtitle: 'Nos alegra tenerte aquí' }),
          block('text', { content: 'Hola {primer_nombre},\n\nGracias por unirte a {empresa}. Estos son los siguientes pasos:' }),
          block('columns', {
            items: [
              { title: '1. Conócenos', text: 'Mira lo que podemos hacer por ti.' },
              { title: '2. Escríbenos', text: 'Responde este correo con tus dudas.' },
            ],
          }),
          block('button', { label: 'Empezar', href: '{link}' }),
          block('footer', { text: 'Un abrazo, el equipo de {empresa}.' }),
        ],
      },
    },
    {
      key: 'reminder',
      name: 'Recordatorio',
      description: 'Mensaje corto y directo con una sola acción.',
      subject: '{primer_nombre}, un recordatorio rápido',
      preheader: 'Te tomará menos de un minuto.',
      design: {
        settings: { brandColor: '#ea580c' },
        blocks: [
          block('text', { content: 'No se te pase', heading: 'h1', align: 'center' }),
          block('text', { content: 'Hola {primer_nombre}, solo queríamos recordarte que tienes algo pendiente con nosotros.', align: 'center' }),
          block('button', { label: 'Resolver ahora', href: '{link}', full: true }),
          block('spacer', { height: 12 }),
          block('footer', { text: '{empresa}' }),
        ],
      },
    },
  ];
}
