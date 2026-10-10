import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { MetaApiError } from './meta-graph.client';

/**
 * Manejo uniforme de errores:
 * - HttpException → passthrough (status y body de Nest).
 * - MetaApiError que se escape sin traducir → 502 con el mensaje de Meta.
 * - Identificador que no es un ObjectId (BSONError / CastError de Mongoose) →
 *   400: es un dato mal formado de quien llama, no un fallo del servidor.
 * - Cualquier otra excepción → 500 genérico, logueada con stack (el detalle
 *   interno nunca viaja al cliente).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : body,
        );
      return;
    }

    if (exception instanceof MetaApiError) {
      this.logger.warn(
        `MetaApiError sin traducir en ${req.method} ${req.url}: ${exception.message}`,
      );
      res.status(HttpStatus.BAD_GATEWAY).json({
        statusCode: HttpStatus.BAD_GATEWAY,
        message: exception.message,
      });
      return;
    }

    if (isInvalidId(exception)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Identificador inválido',
      });
      return;
    }

    this.logger.error(
      `Excepción no controlada en ${req.method} ${req.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
    });
  }
}

/**
 * Por nombre y no con `instanceof`: `bson` puede estar cargado más de una vez
 * (el de mongoose y el del driver) y cada copia tiene su propia clase.
 */
function isInvalidId(exception: unknown): boolean {
  if (!(exception instanceof Error)) return false;
  if (exception.name === 'BSONError') return true;
  return (
    exception.name === 'CastError' &&
    (exception as { kind?: string }).kind === 'ObjectId'
  );
}
