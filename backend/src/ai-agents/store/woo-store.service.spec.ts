import { BadRequestException } from '@nestjs/common';
import {
  decodeHtml,
  normalizeStoreUrl,
  pickPhoto,
  WooStoreService,
} from './woo-store.service';

const wooItem = {
  id: 8667,
  name: 'Dolopak (Paracetamol 500mg) Tab &#8211; Caja x100un (B)',
  permalink: 'https://farmacenter.com.pe/product/dolopak/',
  prices: {
    price: '4000',
    regular_price: '7000',
    currency_minor_unit: 2,
    currency_symbol: 'S/',
  },
  is_in_stock: true,
  is_purchasable: true,
  low_stock_remaining: 3,
  categories: [{ name: 'Receta Médica' }],
  images: [
    {
      src: 'https://x/foto.png',
      srcset:
        'https://x/foto.png 2560w, https://x/foto-300.png 300w, https://x/foto-1024.png 1024w, https://x/foto-1536.png 1536w',
    },
  ],
};

function json(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

describe('WooStoreService', () => {
  let service: WooStoreService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new WooStoreService();
    fetchSpy = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('consulta la Store API y deja el producto listo para el modelo', async () => {
    fetchSpy.mockResolvedValue(json([wooItem]));
    const [p] = await service.search('https://farmacenter.com.pe', 'dolopak');

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain(
      'https://farmacenter.com.pe/wp-json/wc/store/v1/products?search=dolopak&per_page=8',
    );
    expect(p).toMatchObject({
      id: 8667,
      nombre: 'Dolopak (Paracetamol 500mg) Tab – Caja x100un (B)',
      precio: 'S/ 40.00',
      precio_regular: 'S/ 70.00',
      disponible: true,
      stock_bajo: 3,
      requiere_receta: true,
      tiene_foto: true,
      foto: 'https://x/foto-1024.png',
    });
  });

  it('sin oferta no informa precio regular; sin comprar online no está disponible', async () => {
    fetchSpy.mockResolvedValue(
      json([
        {
          ...wooItem,
          prices: { ...wooItem.prices, regular_price: '4000' },
          is_purchasable: false,
        },
      ]),
    );
    const [p] = await service.search('https://farmacenter.com.pe', 'x');
    expect(p.precio_regular).toBeNull();
    expect(p.disponible).toBe(false);
  });

  it('cachea la misma búsqueda por un minuto', async () => {
    fetchSpy.mockResolvedValue(json([wooItem]));
    await service.search('https://farmacenter.com.pe', 'Dolopak');
    await service.search('https://farmacenter.com.pe', ' dolopak ');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('reintenta una vez y luego avisa que la web no responde', async () => {
    fetchSpy.mockRejectedValue(new Error('timeout'));
    await expect(
      service.search('https://farmacenter.com.pe', 'dolopak'),
    ).rejects.toThrow('web_no_responde');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('una respuesta que no es lista cuenta como fallo', async () => {
    fetchSpy.mockResolvedValue(json({ code: 'rest_no_route' }));
    await expect(
      service.search('https://farmacenter.com.pe', 'dolopak'),
    ).rejects.toThrow('web_no_responde');
  });
});

describe('helpers de tienda', () => {
  it('decodeHtml traduce entidades numéricas y con nombre', () => {
    expect(decodeHtml('A &#8211; B &amp; C &#x2014; &quot;D&quot;')).toBe(
      'A – B & C — "D"',
    );
  });

  it('pickPhoto elige el tamaño más grande hasta 1024 px', () => {
    expect(pickPhoto(wooItem.images[0])).toBe('https://x/foto-1024.png');
    expect(pickPhoto({ src: 'https://x/solo.png' })).toBe('https://x/solo.png');
    expect(pickPhoto(undefined)).toBeUndefined();
  });

  it('normalizeStoreUrl deja solo el origen https', () => {
    expect(normalizeStoreUrl(' https://farmacenter.com.pe/tienda/ ')).toBe(
      'https://farmacenter.com.pe',
    );
  });

  it.each([
    'http://farmacenter.com.pe',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://intranet',
    'https://db.internal',
    'no es url',
  ])('normalizeStoreUrl rechaza %s', (url) => {
    expect(() => normalizeStoreUrl(url)).toThrow(BadRequestException);
  });
});
