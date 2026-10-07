import { BadRequestException } from '@nestjs/common';
import { clientIp, parseCookies, parseUserAgent } from './user-agent';
import { buildDestination } from './link-tracking.service';
import { normalizeDestination, randomCode } from './links.service';

describe('parseUserAgent', () => {
  it('iPhone con Safari', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({
      browser: 'Safari',
      browserVersion: '17',
      os: 'iOS',
      device: 'mobile',
      isBot: false,
    });
  });

  it('Android con Chrome', () => {
    const ua = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    );
    expect(ua).toMatchObject({
      browser: 'Chrome',
      browserVersion: '126',
      os: 'Android',
      device: 'mobile',
    });
  });

  it('Edge en Windows no se confunde con Chrome', () => {
    const ua = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87',
    );
    expect(ua).toMatchObject({
      browser: 'Edge',
      os: 'Windows',
      device: 'desktop',
      isBot: false,
    });
  });

  it('tablet Android (sin "Mobile")', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      ).device,
    ).toBe('tablet');
  });

  it.each([
    'WhatsApp/2.23.20.0 A',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'TelegramBot (like TwitterBot)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'curl/8.4.0',
    '',
  ])('los previsualizadores y rastreadores son bots: %s', (raw) => {
    expect(parseUserAgent(raw).isBot).toBe(true);
  });
});

describe('parseCookies', () => {
  it('lee pares, decodifica y sanea las claves para Mongo', () => {
    expect(parseCookies('mlv=abc; _ga=GA1.2.3; a.b$c=1%202; roto')).toEqual({
      mlv: 'abc',
      _ga: 'GA1.2.3',
      a_b_c: '1 2',
    });
  });

  it('sin cabecera devuelve vacío', () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe('clientIp', () => {
  it('usa el último valor de X-Forwarded-For: el primero lo escribe el cliente', () => {
    expect(clientIp({ forwardedFor: '1.2.3.4, 203.0.113.7' }, '10.0.0.1')).toBe(
      '203.0.113.7',
    );
  });
  it('con Cloudflare delante manda su cabecera', () => {
    expect(
      clientIp(
        {
          forwardedFor: '198.51.100.9, 172.70.1.1',
          cfConnectingIp: '198.51.100.9',
        },
        undefined,
      ),
    ).toBe('198.51.100.9');
  });
  it('sin proxy usa la del socket, sin el prefijo IPv4-mapeado', () => {
    expect(clientIp({}, '::ffff:198.51.100.4')).toBe('198.51.100.4');
  });
});

describe('buildDestination', () => {
  it('añade UTM y los parámetros con que se abrió, sin pisar los del destino', () => {
    const url = new URL(
      buildDestination(
        {
          destination: 'https://tienda.com/oferta?ref=base',
          utm: { source: 'sms', campaign: 'oct' },
        },
        { ref: 'otro', cupon: 'A1' },
      ),
    );
    expect(url.searchParams.get('ref')).toBe('base');
    expect(url.searchParams.get('utm_source')).toBe('sms');
    expect(url.searchParams.get('utm_campaign')).toBe('oct');
    expect(url.searchParams.get('cupon')).toBe('A1');
  });
});

describe('normalizeDestination', () => {
  it('añade https si falta el esquema', () => {
    expect(normalizeDestination('tienda.com/x')).toBe('https://tienda.com/x');
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'file:///etc/passwd',
  ])('rechaza %s', (raw) => {
    expect(() => normalizeDestination(raw)).toThrow(BadRequestException);
  });
});

describe('randomCode', () => {
  it('genera códigos base62 de 7 caracteres', () => {
    const codes = new Set(Array.from({ length: 200 }, () => randomCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[0-9A-Za-z]{7}$/);
  });
});
