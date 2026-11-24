import { signMp, verifyMpSignature } from './mp-signature';

const SECRET = 'whsec';

describe('verifyMpSignature (HU45)', () => {
  it('acepta la firma correcta, también con id en mayúsculas', () => {
    const signature = signMp('ABC123', 'req-1', SECRET);
    expect(
      verifyMpSignature({
        signature,
        requestId: 'req-1',
        dataId: 'ABC123',
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it('C1: rechaza firma alterada, otro recurso, otro request-id o sin secreto', () => {
    const signature = signMp('123', 'req-1', SECRET);
    const tampered = signature.replace(
      /v1=(.)/,
      (_, c) => `v1=${c === 'a' ? 'b' : 'a'}`,
    );
    expect(
      verifyMpSignature({
        signature: tampered,
        requestId: 'req-1',
        dataId: '123',
        secret: SECRET,
      }),
    ).toBe(false);
    expect(
      verifyMpSignature({
        signature,
        requestId: 'req-1',
        dataId: '999',
        secret: SECRET,
      }),
    ).toBe(false);
    expect(
      verifyMpSignature({
        signature,
        requestId: 'req-2',
        dataId: '123',
        secret: SECRET,
      }),
    ).toBe(false);
    expect(
      verifyMpSignature({
        signature,
        requestId: 'req-1',
        dataId: '123',
        secret: '',
      }),
    ).toBe(false);
    expect(
      verifyMpSignature({
        signature: 'basura',
        requestId: 'req-1',
        dataId: '123',
        secret: SECRET,
      }),
    ).toBe(false);
  });
});
