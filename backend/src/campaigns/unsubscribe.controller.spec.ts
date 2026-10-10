import { UnsubscribeController } from './unsubscribe.controller';

const token = 'cGF5bG9hZA.firma';

describe('UnsubscribeController', () => {
  let controller: UnsubscribeController;
  let sender: { verifyUnsubscribeToken: jest.Mock; unsubscribe: jest.Mock };

  beforeEach(() => {
    sender = {
      verifyUnsubscribeToken: jest.fn().mockReturnValue(null),
      unsubscribe: jest.fn().mockResolvedValue(false),
    };
    controller = new UnsubscribeController(sender as never);
  });

  describe('GET /u/:token', () => {
    it('con un token válido muestra el botón de confirmación sin dar de baja', () => {
      sender.verifyUnsubscribeToken.mockReturnValue({
        tenantId: '665f1f1f1f1f1f1f1f1f1f1f',
        to: 'ana@correo.pe',
      });

      const html = controller.confirm(token);

      expect(sender.verifyUnsubscribeToken).toHaveBeenCalledWith(token);
      expect(html).toContain('<form method="post">');
      expect(html).toContain('Darme de baja');
      // Los filtros antispam abren todos los enlaces: el GET no da de baja.
      expect(sender.unsubscribe).not.toHaveBeenCalled();
    });

    it('con un token inválido avisa y no ofrece el formulario', () => {
      const html = controller.confirm('manipulado');

      expect(html).toContain('Enlace no válido');
      expect(html).not.toContain('<form');
      expect(sender.unsubscribe).not.toHaveBeenCalled();
    });

    it('no revela a quién pertenece el enlace', () => {
      sender.verifyUnsubscribeToken.mockReturnValue({
        tenantId: '665f1f1f1f1f1f1f1f1f1f1f',
        to: 'ana@correo.pe',
      });

      const html = controller.confirm(token);

      expect(html).not.toContain('ana@correo.pe');
      expect(html).not.toContain('665f1f1f1f1f1f1f1f1f1f1f');
    });

    it('pide a los buscadores que no indexen la página', () => {
      expect(controller.confirm(token)).toContain(
        '<meta name="robots" content="noindex">',
      );
    });
  });

  describe('POST /u/:token', () => {
    it('da de baja con el token recibido y confirma', async () => {
      sender.unsubscribe.mockResolvedValue(true);

      const html = await controller.unsubscribe(token);

      expect(sender.unsubscribe).toHaveBeenCalledTimes(1);
      expect(sender.unsubscribe).toHaveBeenCalledWith(token);
      expect(html).toContain('<h1 style="font-size:22px;margin:0 0 12px;">');
      expect(html).toContain('Te hemos dado de baja');
    });

    it('si el token no es válido informa del fallo en vez de confirmar', async () => {
      const html = await controller.unsubscribe('manipulado');

      expect(html).toContain('Enlace no válido');
      expect(html).not.toContain('Te hemos dado de baja');
    });
  });

  describe('contrato HTTP', () => {
    // Los decoradores de ruta dejan sus metadatos en la función del método.
    const proto = UnsubscribeController.prototype as unknown as Record<
      string,
      object
    >;
    const handlers = [proto.confirm, proto.unsubscribe];

    it('es público: ni la clase ni las rutas llevan guards', () => {
      expect(
        Reflect.getMetadata('__guards__', UnsubscribeController),
      ).toBeUndefined();
      for (const handler of handlers)
        expect(Reflect.getMetadata('__guards__', handler)).toBeUndefined();
    });

    it('el POST responde 200, que es lo que esperan los clientes de correo', () => {
      expect(Reflect.getMetadata('__httpCode__', proto.unsubscribe)).toBe(200);
    });

    it('las dos respuestas son HTML y no se cachean', () => {
      for (const handler of handlers)
        expect(Reflect.getMetadata('__headers__', handler)).toEqual(
          expect.arrayContaining([
            { name: 'Content-Type', value: 'text/html; charset=utf-8' },
            { name: 'Cache-Control', value: 'no-store' },
          ]),
        );
    });
  });
});
