import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiAccess } from './api-access.schema';
import { ApiAccessService } from './api-access.service';

export interface ApiKeyReq extends Request {
  apiAccess: ApiAccess;
}

/**
 * Autentica la API pública de integraciones (HU13): `Authorization: Bearer
 * <clave>` de un acceso vigente, llamada desde un dominio autorizado (cabecera
 * `Origin` o `Referer`) y, si el acceso tiene lista, desde una IP autorizada.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private accesses: ApiAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApiKeyReq>();
    const auth = req.headers.authorization ?? '';
    const key = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
    const access = await this.accesses.authenticate(key);
    if (!access)
      throw new UnauthorizedException(
        'Clave de API inválida o revocada. Envía "Authorization: Bearer <clave>".',
      );
    const problem = this.accesses.originProblem(access, {
      origin: req.headers.origin,
      referer: req.headers.referer,
      ip: req.ip,
    });
    if (problem) throw new ForbiddenException(problem);
    req.apiAccess = access;
    return true;
  }
}
