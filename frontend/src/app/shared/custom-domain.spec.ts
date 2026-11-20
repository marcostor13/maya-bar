import { isCustomDomain, isPlatformHost, setHostForTests } from './custom-domain';

describe('custom-domain (HU25)', () => {
  it('C4: los hosts de la plataforma no son dominios propios', () => {
    for (const h of ['mayacrm.site', 'WWW.mayacrm.site', 'localhost', 'localhost:4200', '127.0.0.1', 'mayacrm.site.'])
      expect(isPlatformHost(h)).toBe(true);
  });

  it('C4: cualquier otro host es el dominio de un cliente', () => {
    expect(isPlatformHost('fiesta.miempresa.com')).toBe(false);
    expect(isPlatformHost('evil-mayacrm.site')).toBe(false);
  });

  it('acepta hosts propios adicionales', () => {
    expect(isPlatformHost('staging.mayacrm.site', ['staging.mayacrm.site'])).toBe(true);
  });

  it('en las pruebas (localhost) no se considera dominio propio', () => {
    expect(isCustomDomain()).toBe(false);
  });

  it('con el host de un cliente sí lo es', () => {
    setHostForTests('fiesta.miempresa.com');
    try {
      expect(isCustomDomain()).toBe(true);
    } finally {
      setHostForTests(null);
    }
  });
});
