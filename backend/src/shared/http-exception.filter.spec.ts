import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';
import { MetaApiError } from './meta-graph.client';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let res: { status: jest.Mock; json: jest.Mock };
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    host = {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({ method: 'GET', url: '/x' }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('deja pasar las HttpException con su status y body', () => {
    filter.catch(new BadRequestException('campo inválido'), host);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'campo inválido' }),
    );
  });

  it('traduce MetaApiError sin capturar a 502 con el mensaje de Meta', () => {
    filter.catch(new MetaApiError('token expired', 401), host);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'token expired' }),
    );
  });

  it('un id que no es ObjectId responde 400, no 500', () => {
    const bson = Object.assign(new Error('input must be a 24 character hex'), {
      name: 'BSONError',
    });
    filter.catch(bson, host);
    expect(res.status).toHaveBeenLastCalledWith(400);

    const cast = Object.assign(new Error('Cast to ObjectId failed'), {
      name: 'CastError',
      kind: 'ObjectId',
    });
    filter.catch(cast, host);
    expect(res.status).toHaveBeenLastCalledWith(400);
    expect(res.json).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Identificador inválido' }),
    );
  });

  it('un CastError de otro tipo sigue siendo un 500', () => {
    const cast = Object.assign(new Error('Cast to Number failed'), {
      name: 'CastError',
      kind: 'Number',
    });
    filter.catch(cast, host);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('oculta el detalle interno de errores no controlados (500 genérico)', () => {
    filter.catch(new Error('mongo password leaked'), host);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json.mock.calls[0] as [Record<string, string>])[0];
    expect(body.message).toBe('Error interno del servidor');
    expect(JSON.stringify(body)).not.toContain('mongo');
  });
});
