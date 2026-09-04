"""Genera los iconos PWA a partir de public/logo.png.

Se ejecuta a mano cuando cambia el logo:
    python3 scripts/generate-icons.py
Los PNG resultantes se versionan en public/icons/, y el favicon en public/.
"""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'logo.png')
OUT = os.path.join(ROOT, 'public', 'icons')
os.makedirs(OUT, exist_ok=True)

BRAND = (225, 29, 72, 255)
WHITE = (255, 255, 255, 255)

logo = Image.open(SRC).convert('RGBA')
# El logotipo trae el isotipo (la "M") arriba y el texto "MAYA" debajo.
# Para el icono solo interesa la marca.
mark = logo.crop((0, 0, logo.width, int(logo.height * 0.63)))

# Recorta el aire: todo lo que no sea blanco/transparente marca el contenido.
px = mark.load()
minx, miny, maxx, maxy = mark.width, mark.height, 0, 0
for y in range(mark.height):
    for x in range(mark.width):
        r, g, b, a = px[x, y]
        if a > 20 and not (r > 240 and g > 240 and b > 240):
            minx, miny = min(minx, x), min(miny, y)
            maxx, maxy = max(maxx, x), max(maxy, y)
mark = mark.crop((minx, miny, maxx + 1, maxy + 1))


def square(size, pad_ratio, bg):
    """Marca centrada sobre un lienzo cuadrado con `pad_ratio` de aire."""
    canvas = Image.new('RGBA', (size, size), bg)
    inner = int(size * (1 - pad_ratio * 2))
    scale = min(inner / mark.width, inner / mark.height)
    w, h = int(mark.width * scale), int(mark.height * scale)
    resized = mark.resize((w, h), Image.LANCZOS)
    canvas.paste(resized, ((size - w) // 2, (size - h) // 2), resized)
    return canvas


def stencil():
    """Silueta de la marca: el fondo del logo es blanco opaco, no transparente,
    así que la máscara sale de la luminancia (cuanto más oscuro, más opaco)."""
    alpha = Image.new('L', mark.size)
    src, dst = mark.load(), alpha.load()
    for y in range(mark.height):
        for x in range(mark.width):
            r, g, b, a = src[x, y]
            lum = (r * 299 + g * 587 + b * 114) // 1000
            # Rampa 235→175: el coral de la marca queda opaco del todo y el
            # blanco del fondo transparente, conservando el antialias del borde.
            solid = min(255, max(0, (235 - lum) * 255 // 60))
            dst[x, y] = int(solid * (a / 255))
    return alpha


MASK = stencil()


def tinted(size, pad_ratio, fg, bg):
    """Silueta monocroma centrada sobre un fondo sólido."""
    canvas = Image.new('RGBA', (size, size), bg)
    inner = int(size * (1 - pad_ratio * 2))
    scale = min(inner / mark.width, inner / mark.height)
    w, h = int(mark.width * scale), int(mark.height * scale)
    canvas.paste(Image.new('RGBA', (w, h), fg),
                 ((size - w) // 2, (size - h) // 2),
                 MASK.resize((w, h), Image.LANCZOS))
    return canvas


for size in (192, 512):
    square(size, 0.12, WHITE).save(os.path.join(OUT, f'icon-{size}.png'))
    # Maskable: Android recorta hasta un 20% por lado, así que la marca va
    # dentro del "safe zone" central y el fondo tiñe todo el lienzo.
    tinted(size, 0.26, WHITE, BRAND).save(os.path.join(OUT, f'icon-maskable-{size}.png'))

# Apple no aplica máscara ni transparencia: fondo blanco sólido.
square(180, 0.14, WHITE).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))

# Favicon de la pestaña. Multi-resolución en un solo .ico: el navegador elige.
# A 16px el aire sobra —la marca se convertiría en una mancha—, así que el
# padding baja según el tamaño.
# Fondo transparente y no blanco: la marca se apoya sobre el color de la
# pestaña (clara u oscura) en vez de flotar dentro de un recuadro blanco.
PAD_BY_SIZE = {16: 0.02, 32: 0.05, 48: 0.07, 64: 0.08}
frames = [
    tinted(n, PAD_BY_SIZE[n], BRAND, (0, 0, 0, 0)).convert('RGBA')
    for n in sorted(PAD_BY_SIZE)
]
frames[-1].save(
    os.path.join(ROOT, 'public', 'favicon.ico'),
    format='ICO',
    sizes=[(n, n) for n in sorted(PAD_BY_SIZE)],
    append_images=frames[:-1],
)
# Badge monocromo para la notificación en Android (se pinta como silueta).
tinted(96, 0.1, WHITE, (0, 0, 0, 0)).save(os.path.join(OUT, 'badge-96.png'))

print('iconos generados en', OUT)
