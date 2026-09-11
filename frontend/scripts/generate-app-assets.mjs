/**
 * Genera las fuentes de icono y splash de la app nativa a partir de
 * `public/logo.png`, y las deja en `assets/` con los nombres y tamaños que
 * espera `@capacitor/assets`.
 *
 * El logo original es un lockup (símbolo + palabra "MAYA") sobre fondo blanco
 * opaco. Aquí se hacen dos cosas que no se pueden hacer con un simple resize:
 *
 *  1. Se separa el símbolo del texto. A 48dp la palabra es ilegible, así que
 *     el icono usa solo el símbolo; el lockup completo se reserva al splash.
 *  2. Se recupera el canal alfa. El PNG viene aplanado sobre blanco, de modo
 *     que se deshace esa mezcla (`P = a*C + (1-a)*W`) en vez de recortar por
 *     umbral, que dejaría los bordes dentados.
 *
 * Además invoca `capacitor-assets` para expandirlas a todas las densidades de
 * Android y corrige el `inset` del icono adaptativo (ver `fixAdaptiveIcons`).
 *
 * Uso: bun run assets:android
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public', 'logo.png');
const OUT = path.join(ROOT, 'assets');

/** Fondo de marca: blanco, igual que el `backgroundColor` de capacitor.config. */
const BRAND_BG = { r: 255, g: 255, b: 255, alpha: 1 };
/** Fondo del splash oscuro: el gris de `--color-text-main`. */
const DARK_BG = { r: 17, g: 24, b: 39, alpha: 1 };

const ICON_SIZE = 1024;
const SPLASH_SIZE = 2732;
/**
 * El símbolo ocupa el 42% del lienzo de 108dp. El launcher solo enseña los
 * 72dp centrales, así que eso deja el símbolo en torno al 63% del diámetro
 * visible: la holgura habitual de un icono de app. Subirlo al 52% lo pega al
 * borde de la máscara circular.
 */
const ICON_CONTENT_RATIO = 0.42;
/** El lockup ocupa el 26% del splash. Más grande se ve pesado a pantalla completa. */
const SPLASH_CONTENT_RATIO = 0.26;

const isBg = (r, g, b, a) => a < 32 || (r >= 235 && g >= 235 && b >= 235);

/** Devuelve el buffer RGBA con el fondo blanco convertido en transparencia. */
async function unflatten() {
  const { data, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Color de tinta: el píxel más saturado del logo (es un color plano).
  let ink = { r: 0, g: 0, b: 0 };
  let bestSpread = -1;
  for (let i = 0; i < data.length; i += channels) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (isBg(r, g, b, a)) continue;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread > bestSpread) { bestSpread = spread; ink = { r, g, b }; }
  }

  // Blanco de referencia = esquina superior izquierda.
  const W = { r: data[0], g: data[1], b: data[2] };
  // Se despeja alfa en el canal donde tinta y fondo más se separan.
  const deltas = { r: W.r - ink.r, g: W.g - ink.g, b: W.b - ink.b };
  const ch = ['r', 'g', 'b'].reduce((a, c) => (Math.abs(deltas[c]) > Math.abs(deltas[a]) ? c : a), 'r');
  const offset = { r: 0, g: 1, b: 2 }[ch];
  const denom = deltas[ch];

  const out = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const i = p * channels;
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (isBg(r, g, b, a)) continue; // queda transparente
    const alpha = Math.max(0, Math.min(1, (W[ch] - data[i + offset]) / denom));
    out[p * 4] = ink.r;
    out[p * 4 + 1] = ink.g;
    out[p * 4 + 2] = ink.b;
    out[p * 4 + 3] = Math.round(alpha * 255);
  }

  return { buffer: out, width, height, channels: 4, ink };
}

/** Recorta al contenido visible dentro de una franja vertical del original. */
function bbox({ buffer, width, height }, yFrom, yTo) {
  let x0 = width, x1 = -1, y0 = height, y1 = -1;
  for (let y = yFrom; y <= yTo; y++) {
    for (let x = 0; x < width; x++) {
      if (buffer[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Franjas horizontales continuas con contenido: [símbolo, palabra]. */
function bands({ buffer, width, height }) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    let has = false;
    for (let x = 0; x < width && !has; x++) if (buffer[(y * width + x) * 4 + 3] > 8) has = true;
    rows.push(has);
  }
  const result = [];
  let start = -1;
  for (let y = 0; y < height; y++) {
    if (rows[y] && start === -1) start = y;
    if (!rows[y] && start !== -1) { result.push([start, y - 1]); start = -1; }
  }
  if (start !== -1) result.push([start, height - 1]);
  return result;
}

/** Coloca `art` centrado en un lienzo cuadrado, ocupando `ratio` del lado. */
async function centerOn(art, canvasSize, ratio, background) {
  const meta = await sharp(art).metadata();
  const scale = (canvasSize * ratio) / Math.max(meta.width, meta.height);
  const w = Math.round(meta.width * scale);
  const h = Math.round(meta.height * scale);
  const resized = await sharp(art).resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

  return sharp({
    create: { width: canvasSize, height: canvasSize, channels: 4, background },
  })
    .composite([{ input: resized, left: Math.round((canvasSize - w) / 2), top: Math.round((canvasSize - h) / 2) }])
    .png()
    .toBuffer();
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * Icono de la barra de estado. Android lo dibuja usando SOLO el canal alfa
 * (la silueta), así que va en blanco puro sobre transparente: cualquier color
 * se descarta y un PNG a todo color saldría como un cuadrado gris.
 * 24dp de lado, con la silueta al 88% para que respire.
 */
const STATUS_ICON_DENSITIES = {
  'drawable-mdpi': 24,
  'drawable-hdpi': 36,
  'drawable-xhdpi': 48,
  'drawable-xxhdpi': 72,
  'drawable-xxxhdpi': 96,
};
const STATUS_ICON_RATIO = 0.88;

async function writeNotificationIcon(symbol) {
  // Silueta blanca = alfa del símbolo + color plano blanco. No sirve `tint()`:
  // conserva la luminancia del original y devuelve un gris.
  const meta = await sharp(symbol).metadata();
  const alpha = await sharp(symbol).ensureAlpha().extractChannel('alpha').raw().toBuffer();
  const white = await sharp({
    create: {
      width: meta.width,
      height: meta.height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .joinChannel(alpha, { raw: { width: meta.width, height: meta.height, channels: 1 } })
    .png()
    .toBuffer();

  const resDir = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
  for (const [density, size] of Object.entries(STATUS_ICON_DENSITIES)) {
    const dir = path.join(resDir, density);
    await fs.mkdir(dir, { recursive: true });
    const canvas = await centerOn(white, size, STATUS_ICON_RATIO, TRANSPARENT);
    await fs.writeFile(path.join(dir, 'ic_stat_maya.png'), canvas);
  }
  console.log(`icono de notificación: ic_stat_maya en ${Object.keys(STATUS_ICON_DENSITIES).length} densidades`);
}

const ADAPTIVE_ICON_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;

/**
 * `capacitor-assets` envuelve las dos capas en un `inset` del 16.7%. Eso
 * encoge el fondo justo hasta el borde visible de la máscara (deja ver
 * transparencia al hacer parallax) y reduce el símbolo al ~35% del lienzo,
 * cuando la zona segura permite el 61%. Las capas ya vienen con la proporción
 * correcta desde este script, así que el inset sobra.
 */
async function fixAdaptiveIcons() {
  const dir = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26');
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    await fs.writeFile(path.join(dir, name), ADAPTIVE_ICON_XML);
  }
  console.log('icono adaptativo: inset eliminado en ic_launcher.xml y ic_launcher_round.xml');
}

function runCapacitorAssets() {
  const bin = path.join(ROOT, 'node_modules', '@capacitor', 'assets', 'dist', 'index.js');
  execFileSync(process.execPath, [
    bin, 'generate', '--android',
    '--iconBackgroundColor', '#FFFFFF',
    '--iconBackgroundColorDark', '#FFFFFF',
    '--splashBackgroundColor', '#FFFFFF',
    '--splashBackgroundColorDark', '#111827',
  ], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('capacitor-assets: recursos de Android regenerados');
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  const logo = await unflatten();
  const [symbolBand, wordBand] = bands(logo);
  if (!symbolBand || !wordBand) {
    throw new Error('No se han encontrado las dos franjas del logo (símbolo y palabra)');
  }

  const raw = { raw: { width: logo.width, height: logo.height, channels: 4 } };

  // Símbolo suelto, para el icono.
  const symbolBox = bbox(logo, symbolBand[0], symbolBand[1]);
  const symbol = await sharp(logo.buffer, raw).extract(symbolBox).png().toBuffer();

  // Lockup completo, para el splash.
  const lockupBox = bbox(logo, symbolBand[0], wordBand[1]);
  const lockup = await sharp(logo.buffer, raw).extract(lockupBox).png().toBuffer();

  const write = (name, buf) => fs.writeFile(path.join(OUT, name), buf);

  // Icono adaptativo de Android: capas separadas.
  await write('icon-foreground.png', await centerOn(symbol, ICON_SIZE, ICON_CONTENT_RATIO, TRANSPARENT));
  await write('icon-background.png', await sharp({
    create: { width: ICON_SIZE, height: ICON_SIZE, channels: 4, background: BRAND_BG },
  }).png().toBuffer());

  // Icono plano de respaldo (Android < 8 y tiendas).
  await write('icon.png', await centerOn(symbol, ICON_SIZE, ICON_CONTENT_RATIO, BRAND_BG));

  // Splash: el lockup completo, que sí se lee a pantalla completa.
  await write('splash.png', await centerOn(lockup, SPLASH_SIZE, SPLASH_CONTENT_RATIO, BRAND_BG));
  await write('splash-dark.png', await centerOn(lockup, SPLASH_SIZE, SPLASH_CONTENT_RATIO, DARK_BG));

  const ink = `rgb(${logo.ink.r}, ${logo.ink.g}, ${logo.ink.b})`;
  console.log(`tinta detectada: ${ink}`);
  console.log(`símbolo: ${symbolBox.width}x${symbolBox.height} @ (${symbolBox.left},${symbolBox.top})`);
  console.log(`lockup:  ${lockupBox.width}x${lockupBox.height} @ (${lockupBox.left},${lockupBox.top})`);
  console.log(`escrito en ${OUT}`);

  runCapacitorAssets();
  await fixAdaptiveIcons();
  await writeNotificationIcon(symbol);
}

await main();
