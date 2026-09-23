import { SecretBox } from './secret-box';

describe('SecretBox', () => {
  const box = new SecretBox('clave-de-prueba');

  it('cifra y descifra sin dejar el texto a la vista', () => {
    const sealed = box.encrypt('contraseña ñ 🔐');
    expect(sealed).not.toContain('contraseña');
    expect(sealed.startsWith('v1:')).toBe(true);
    expect(box.decrypt(sealed)).toBe('contraseña ñ 🔐');
  });

  it('usa un IV distinto en cada cifrado', () => {
    expect(box.encrypt('x')).not.toBe(box.encrypt('x'));
  });

  it('detecta manipulación o una clave distinta', () => {
    const sealed = box.encrypt('secreto');
    const parts = sealed.split(':');
    parts[3] = Buffer.from('otro').toString('base64');
    expect(() => box.decrypt(parts.join(':'))).toThrow();
    expect(() => new SecretBox('otra-clave').decrypt(sealed)).toThrow();
    expect(() => box.decrypt('texto-plano')).toThrow('formato desconocido');
  });
});
