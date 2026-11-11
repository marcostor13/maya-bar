import {
  isTransientSendError,
  metaErrorCode,
  retryDelayMs,
} from './message-retry.policy';

describe('message-retry.policy', () => {
  it.each([
    '#131042 Business eligibility payment issue — currency is not configured',
    'Error: CloudAPI 400 #130429: Rate limit hit',
    'Error: CloudAPI media 500 #131000: Something went wrong',
    'Error: CloudAPI 401 #190: Error validating access token',
    'Error: getaddrinfo ENOTFOUND graph.facebook.com',
    'Error: connect ECONNREFUSED 157.240.0.1:443',
  ])('reintenta un error temporal: %s', (error) => {
    expect(isTransientSendError(error)).toBe(true);
  });

  it.each([
    // Cortes a mitad: Meta pudo enviarlo; reintentar duplicaría.
    'TypeError: fetch failed',
    'Error: read ECONNRESET',
    'Error: connect ETIMEDOUT 157.240.0.1:443',
    '#131047 Re-engagement message — more than 24 hours',
    '#131026 Message undeliverable',
    '#131048 Spam rate limit hit',
    'Error: CloudAPI 400 #100: Invalid parameter',
    'Error: CloudAPI 400: Invalid parameter',
    'La cuenta de WhatsApp está inactiva',
    '',
    undefined,
  ])('no reintenta un error que no es temporal: %s', (error) => {
    expect(isTransientSendError(error)).toBe(false);
  });

  it('lee el código de Meta de los dos formatos', () => {
    expect(metaErrorCode('#131042 Título — detalle')).toBe(131042);
    expect(metaErrorCode('Error: CloudAPI 400 #130429: x')).toBe(130429);
    expect(metaErrorCode('sin código')).toBeUndefined();
  });

  it('espera cada vez más y se queda en una hora', () => {
    const min = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => retryDelayMs(n) / 60_000);
    expect(min).toEqual([2, 5, 10, 20, 30, 60, 60, 60]);
  });
});
