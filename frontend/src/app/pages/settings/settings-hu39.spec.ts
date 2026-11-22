import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// HU39: regla global de inputs ≥ 16 px en el móvil y padding de móvil entre 769 y 968 px.
describe('styles.scss (HU39)', () => {
  // Sin \r: el archivo puede tener saltos CRLF.
  const css = readFileSync(resolve(process.cwd(), 'src/styles.scss'), 'utf-8').replace(/\r/g, '');

  it('C1: en ≤ 768 px todo input de texto, select y textarea va a 16 px con !important', () => {
    const start = css.search(/@media \(max-width: 768px\) \{\s*\.input, \.select/);
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, start + 400);
    expect(block).toMatch(/select, textarea \{\s*font-size: 16px !important;/);
    expect(block).toContain('input:not([type="checkbox"])');
  });

  it('C2: entre 769 y 968 px las páginas usan el padding de móvil', () => {
    expect(css).toMatch(/@media \(min-width: 769px\) and \(max-width: 968px\) \{\s*\.main-content \.page \{\s*padding-top: 24px !important;/);
  });
});
