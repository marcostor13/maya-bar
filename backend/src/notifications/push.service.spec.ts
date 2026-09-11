import { createPrivateKey, generateKeyPairSync } from 'crypto';
import { describeKeyShape, normalizePrivateKey } from './push.service';

/**
 * La clave se guarda bien y aun así el contenedor no la parseaba: docker-compose
 * altera las barras invertidas al inyectarla. Estos casos reproducen cada forma
 * en que ha llegado rota.
 */
describe('normalizePrivateKey', () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const pem = privateKey;

  /** Vale si el resultado es una clave que `crypto` acepta. */
  const parsea = (valor: string) => {
    expect(() => createPrivateKey(normalizePrivateKey(valor))).not.toThrow();
  };

  it('acepta el PEM tal cual, con saltos de línea reales', () => {
    parsea(pem);
  });

  it('acepta la forma de .env: una línea con \\n escapados', () => {
    parsea(pem.replace(/\n/g, '\\n'));
  });

  it('acepta las barras duplicadas que introduce docker-compose', () => {
    parsea(pem.replace(/\n/g, '\\\\n'));
  });

  it('acepta el valor entrecomillado', () => {
    parsea(`"${pem.replace(/\n/g, '\\n')}"`);
    parsea(`'${pem.replace(/\n/g, '\\n')}'`);
  });

  it('acepta los guiones escapados de las cabeceras', () => {
    parsea(pem.replace(/\n/g, '\\n').replace(/-----/g, '\\-\\-\\-\\-\\-'));
  });

  it('tolera espacios alrededor y garantiza el salto final', () => {
    const salida = normalizePrivateKey(`  ${pem.trim()}  `);
    expect(salida.endsWith('\n')).toBe(true);
    parsea(`  ${pem.trim()}  `);
  });
});

describe('describeKeyShape', () => {
  it('describe la forma sin revelar el contenido', () => {
    const secreto =
      '-----BEGIN PRIVATE KEY-----\\nSUPERSECRETO\\n-----END PRIVATE KEY-----';
    const forma = describeKeyShape(secreto);

    expect(forma).toContain('2 "\\n" literales');
    expect(forma).toContain(`${secreto.length} chars`);
    expect(forma).not.toContain('SUPERSECRETO');
  });
});
