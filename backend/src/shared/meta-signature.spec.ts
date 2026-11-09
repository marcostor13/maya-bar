import { maskPhone, signMetaBody, verifyMetaSignature } from './meta-signature';

describe('verifyMetaSignature', () => {
  const body = Buffer.from('{"entry":[1]}');

  it('acepta la firma correcta del cuerpo crudo', () => {
    expect(
      verifyMetaSignature(body, signMetaBody(body, 's3cr3t'), 's3cr3t'),
    ).toBe(true);
  });

  it('rechaza otro secreto, otro cuerpo, cabecera ausente o mal formada', () => {
    const sig = signMetaBody(body, 's3cr3t');
    expect(verifyMetaSignature(body, sig, 'otro')).toBe(false);
    expect(
      verifyMetaSignature(Buffer.from('{"entry":[2]}'), sig, 's3cr3t'),
    ).toBe(false);
    expect(verifyMetaSignature(body, undefined, 's3cr3t')).toBe(false);
    expect(verifyMetaSignature(body, 'sha1=abc', 's3cr3t')).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=zz', 's3cr3t')).toBe(false);
    expect(verifyMetaSignature(undefined, sig, 's3cr3t')).toBe(false);
  });
});

describe('maskPhone', () => {
  it('oculta el centro del número', () => {
    expect(maskPhone('51987654678')).toBe('519***678');
    expect(maskPhone('12345')).toBe('***');
    expect(maskPhone(undefined)).toBe('?');
  });
});
