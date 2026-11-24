import { signSvix, verifySvixSignature } from './svix-signature';

describe('svix-signature (HU61)', () => {
  const secret = `whsec_${Buffer.from('clave-de-prueba-32-bytes-aaaaaaa').toString('base64')}`;
  const body = '{"type":"email.opened"}';
  const now = 1_764_000_000_000;
  const ts = String(now / 1000);

  it('acepta la firma correcta, también entre varias', () => {
    const sig = signSvix(secret, 'msg_1', ts, body);
    expect(
      verifySvixSignature(
        secret,
        { id: 'msg_1', timestamp: ts, signature: sig },
        Buffer.from(body),
        now,
      ),
    ).toBe(true);
    expect(
      verifySvixSignature(
        secret,
        { id: 'msg_1', timestamp: ts, signature: `v1,AAAA ${sig}` },
        body,
        now,
      ),
    ).toBe(true);
  });

  it('rechaza cuerpo cambiado, otra clave, id distinto o marca vieja', () => {
    const sig = signSvix(secret, 'msg_1', ts, body);
    expect(
      verifySvixSignature(
        secret,
        { id: 'msg_1', timestamp: ts, signature: sig },
        '{"type":"x"}',
        now,
      ),
    ).toBe(false);
    expect(
      verifySvixSignature(
        `whsec_${Buffer.from('otra').toString('base64')}`,
        { id: 'msg_1', timestamp: ts, signature: sig },
        body,
        now,
      ),
    ).toBe(false);
    expect(
      verifySvixSignature(
        secret,
        { id: 'msg_2', timestamp: ts, signature: sig },
        body,
        now,
      ),
    ).toBe(false);
    expect(
      verifySvixSignature(
        secret,
        { id: 'msg_1', timestamp: ts, signature: sig },
        body,
        now + 10 * 60_000,
      ),
    ).toBe(false);
    expect(
      verifySvixSignature(secret, { id: 'msg_1', timestamp: ts }, body, now),
    ).toBe(false);
  });
});
