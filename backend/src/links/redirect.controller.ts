import {
  Controller,
  Get,
  Head,
  Injectable,
  NestMiddleware,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { LinkTrackingService } from './link-tracking.service';
import { PING_BODY, PING_PATH } from './links.service';

/**
 * Redirección pública en el dominio de la plataforma: `{API}/l/:code`.
 * Sin guards a propósito: lo abre cualquiera que reciba el link.
 */
@Controller('l')
export class RedirectController {
  constructor(private tracking: LinkTrackingService) {}

  @Get(':code')
  open(@Param('code') code: string, @Req() req: Request, @Res() res: Response) {
    return this.tracking.handle('', code, req, res);
  }

  @Head(':code')
  probe(
    @Param('code') code: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.tracking.handle('', code, req, res);
  }
}

/**
 * En un dominio corto propio el link es `https://dominio/:code`, sin prefijo.
 * Se resuelve en un middleware (por `Host`) y no con una ruta `/:code`, que
 * chocaría con todas las rutas de un solo segmento de la API.
 */
@Injectable()
export class ShortDomainMiddleware implements NestMiddleware {
  constructor(private tracking: LinkTrackingService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Sirve para comprobar, desde fuera, que un dominio ya llega a este backend.
    if (req.path === PING_PATH) {
      res.setHeader('Cache-Control', 'no-store');
      res.type('text/plain').send(PING_BODY);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const host = (req.headers.host ?? '').split(':')[0].toLowerCase();
    if (!host || !(await this.tracking.isShortDomain(host))) return next();

    const code = req.path.replace(/^\/+|\/+$/g, '');
    // En un dominio corto no existe la API: o es un link o no es nada.
    await this.tracking.handle(host, code, req, res);
  }
}
