/**
 * Genera todos los rasters de marca a partir de `public/logo.svg` y
 * `public/isotipo.svg` (las fuentes de verdad).
 *
 *   cd frontend
 *   npm i --no-save sharp png-to-ico
 *   node scripts/brand-assets.mjs
 *
 * Salidas: public/logo.png, public/favicon.ico y public/icons/*.png.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '../public');
const ICONS = path.join(PUBLIC, 'icons');
const BRAND = '#E11D48';

const logoSvg = fs.readFileSync(path.join(PUBLIC, 'logo.svg'));
const isoSvg = fs.readFileSync(path.join(PUBLIC, 'isotipo.svg'), 'utf8');
const isoWhite = Buffer.from(isoSvg.replaceAll(BRAND, '#FFFFFF'));
const isoBrand = Buffer.from(isoSvg);

/** Isotipo centrado sobre un fondo sólido, ocupando `ratio` del lienzo. */
async function iconOnBrand(size, ratio, out) {
  const mark = await sharp(isoWhite, { density: 900 })
    .resize(Math.round(size * ratio), Math.round(size * ratio))
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(out);
}

/** Isotipo sobre fondo transparente (favicon, badge de notificación). */
async function iconTransparent(svg, size, ratio, out) {
  const inner = Math.round(size * ratio);
  const mark = await sharp(svg, { density: 900 }).resize(inner, inner).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(out);
}

fs.mkdirSync(ICONS, { recursive: true });

// Lockup horizontal a 3x (se usa a 32-40 px de alto en la app y la landing).
await sharp(logoSvg, { density: 900 }).resize({ width: 930 }).png().toFile(path.join(PUBLIC, 'logo.png'));

// Iconos de la PWA: blanco sobre rojo de marca.
await iconOnBrand(192, 0.6, path.join(ICONS, 'icon-192.png'));
await iconOnBrand(512, 0.6, path.join(ICONS, 'icon-512.png'));
await iconOnBrand(180, 0.6, path.join(ICONS, 'apple-touch-icon.png'));
// Maskable: el icono debe caber en el círculo seguro del 80 %.
await iconOnBrand(192, 0.46, path.join(ICONS, 'icon-maskable-192.png'));
await iconOnBrand(512, 0.46, path.join(ICONS, 'icon-maskable-512.png'));
// Badge de notificación en Android: silueta blanca sobre transparente.
await iconTransparent(isoWhite, 96, 0.78, path.join(ICONS, 'badge-96.png'));

// Favicon: rojo sobre transparente, legible en pestañas claras y oscuras.
const faviconSizes = [16, 32, 48];
const faviconFiles = [];
for (const size of faviconSizes) {
  const file = path.join(ICONS, `.favicon-${size}.png`);
  await iconTransparent(isoBrand, size, 0.88, file);
  faviconFiles.push(file);
}
fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), await pngToIco(faviconFiles));
faviconFiles.forEach((f) => fs.unlinkSync(f));

console.log('Assets de marca regenerados.');

// ---------------------------------------------------------------------------
// App nativa (Capacitor / Android): iconos de launcher y splash.
// Se respetan los tamaños que ya existen en el proyecto, densidad por densidad.
// ---------------------------------------------------------------------------

const ANDROID_RES = path.join(here, '../android/app/src/main/res');

async function size(file) {
  return (await sharp(file).metadata()).width;
}

if (fs.existsSync(ANDROID_RES)) {
  const dirs = fs.readdirSync(ANDROID_RES);

  for (const dir of dirs.filter((d) => d.startsWith('mipmap-') && !d.includes('anydpi'))) {
    const base = path.join(ANDROID_RES, dir);
    const px = await size(path.join(base, 'ic_launcher.png'));

    await iconOnBrand(px, 0.6, path.join(base, 'ic_launcher.png'));
    // El adaptive icon recorta el 25 % exterior: el primer plano va más chico.
    await iconTransparent(isoWhite, px, 0.45, path.join(base, 'ic_launcher_foreground.png'));
    await sharp({ create: { width: px, height: px, channels: 4, background: BRAND } })
      .png()
      .toFile(path.join(base, 'ic_launcher_background.png'));

    // Redondo: el mismo icono recortado en círculo.
    const square = await sharp(path.join(base, 'ic_launcher.png')).toBuffer();
    const circle = Buffer.from(
      `<svg width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="#fff"/></svg>`,
    );
    await sharp(square)
      .composite([{ input: circle, blend: 'dest-in' }])
      .png()
      .toFile(path.join(base, 'ic_launcher_round.png'));
  }

  // Splash: lockup centrado sobre blanco (el backgroundColor de capacitor.config).
  for (const dir of dirs) {
    const splash = path.join(ANDROID_RES, dir, 'splash.png');
    if (!fs.existsSync(splash)) continue;
    const meta = await sharp(splash).metadata();
    const width = Math.round(Math.min(meta.width, meta.height) * 0.62);
    const logo = await sharp(logoSvg, { density: 900 }).resize({ width }).png().toBuffer();
    await sharp({
      create: { width: meta.width, height: meta.height, channels: 4, background: '#FFFFFF' },
    })
      .composite([{ input: logo, gravity: 'centre' }])
      .png()
      .toFile(splash + '.tmp');
    fs.renameSync(splash + '.tmp', splash);
  }

  console.log('Iconos y splash de Android regenerados.');
}
