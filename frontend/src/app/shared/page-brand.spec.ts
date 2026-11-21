import { applyTabBrand } from './page-brand';

describe('applyTabBrand (HU26)', () => {
  const icons = () =>
    Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')).map(l =>
      l.getAttribute('href'),
    );

  beforeEach(() => {
    document.head.querySelectorAll('link[rel~="icon"]').forEach(l => l.remove());
    document.head.insertAdjacentHTML(
      'beforeend',
      '<link rel="icon" type="image/svg+xml" href="/isotipo.svg"><link rel="icon" href="/favicon.ico">',
    );
    document.title = 'Maya CRM';
  });
  afterEach(() => document.head.querySelectorAll('link[rel~="icon"]').forEach(l => l.remove()));

  it('C7: pone el favicon de la empresa en todos los iconos y el título del evento', () => {
    applyTabBrand(document, { title: 'Fiesta', favicon: 'https://cdn.x/f.png', logo: 'https://cdn.x/l.png' });
    expect(icons()).toEqual(['https://cdn.x/f.png', 'https://cdn.x/f.png']);
    expect(document.head.querySelector('link[rel~="icon"]')!.hasAttribute('type')).toBe(false);
    expect(document.title).toBe('Fiesta');
  });

  it('C7: sin favicon usa el logo; sin ninguno conserva el de Maya', () => {
    const undo = applyTabBrand(document, { logo: 'https://cdn.x/l.png' });
    expect(icons()).toEqual(['https://cdn.x/l.png', 'https://cdn.x/l.png']);
    undo();
    applyTabBrand(document, { title: 'Fiesta' });
    expect(icons()).toEqual(['/isotipo.svg', '/favicon.ico']);
  });

  it('C7: si la página no tiene icono, añade uno', () => {
    document.head.querySelectorAll('link[rel~="icon"]').forEach(l => l.remove());
    const undo = applyTabBrand(document, { favicon: 'https://cdn.x/f.png' });
    expect(icons()).toEqual(['https://cdn.x/f.png']);
    undo();
    expect(icons()).toEqual([]);
  });

  it('C7: también cambia el icono de iOS y lo restaura', () => {
    document.head.insertAdjacentHTML('beforeend', '<link rel="apple-touch-icon" href="/icons/apple.png">');
    const apple = () => document.head.querySelector('link[rel="apple-touch-icon"]')!.getAttribute('href');
    const undo = applyTabBrand(document, { favicon: 'https://cdn.x/f.png' });
    expect(apple()).toBe('https://cdn.x/f.png');
    undo();
    expect(apple()).toBe('/icons/apple.png');
    document.head.querySelector('link[rel="apple-touch-icon"]')!.remove();
  });

  it('C8: deshacer restaura favicon, tipo y título', () => {
    const undo = applyTabBrand(document, { title: 'Fiesta', favicon: 'https://cdn.x/f.png' });
    undo();
    expect(icons()).toEqual(['/isotipo.svg', '/favicon.ico']);
    expect(document.head.querySelector('link[rel~="icon"]')!.getAttribute('type')).toBe('image/svg+xml');
    expect(document.title).toBe('Maya CRM');
  });
});
