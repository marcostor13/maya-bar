import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { from, Observable, switchMap } from 'rxjs';
import { BillingAccessService } from './billing-access.service';
import { SubscriptionRequiredException } from './subscription-access';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Rutas que siguen abiertas en solo lectura: sesión, pagar, notificaciones y
 * datos de la empresa (RUC para el comprobante).
 */
const ALWAYS_ALLOWED = [
  '/auth',
  '/billing',
  '/push',
  '/notifications',
  '/tenants/me',
  '/users/me',
];

/** Lo único que la cuenta demo puede escribir: mantener y cerrar su sesión (HU88). */
const DEMO_ALLOWED = ['/auth/refresh', '/auth/logout'];

export const DEMO_READ_ONLY_MESSAGE =
  'Esta es una cuenta demo: puedes ver todo, pero no hacer cambios. Para usar Maya CRM con tus datos, elige un plan en mayacrm.site.';

interface Req {
  method: string;
  originalUrl?: string;
  url: string;
  user?: { tenantId?: string; role?: string };
  /** Llamadas con clave de API pública (`ApiKeyGuard`). */
  apiAccess?: { tenantId?: string | { toHexString(): string } };
}

/**
 * Solo lectura por cobro (HU41, HU51): con la prueba o el plan vencidos se
 * puede entrar, ver y exportar, pero ninguna escritura pasa. Va como
 * interceptor global porque corre después de los guards, cuando `req.user`
 * ya existe; las rutas públicas y los webhooks no tienen usuario y no se tocan.
 */
@Injectable()
export class ReadOnlyInterceptor implements NestInterceptor {
  constructor(private access: BillingAccessService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Req>();
    const tenantId =
      req.user?.tenantId ??
      (req.apiAccess?.tenantId
        ? typeof req.apiAccess.tenantId === 'string'
          ? req.apiAccess.tenantId
          : req.apiAccess.tenantId.toHexString()
        : undefined);
    const path = (req.originalUrl ?? req.url).split('?')[0];
    if (
      !tenantId ||
      req.user?.role === 'SUPERADMIN' ||
      SAFE_METHODS.includes(req.method)
    )
      return next.handle();
    const under = (prefixes: string[]) =>
      prefixes.some((p) => path === p || path.startsWith(`${p}/`));

    return from(this.access.access(tenantId)).pipe(
      switchMap((state) => {
        // La demo es solo para mirar (HU88): ni perfil, ni contraseña, ni pagos.
        if (state.demo && !under(DEMO_ALLOWED))
          throw new ForbiddenException({
            statusCode: 403,
            code: 'DEMO_READ_ONLY',
            message: DEMO_READ_ONLY_MESSAGE,
          });
        if (under(ALWAYS_ALLOWED)) return next.handle();
        if (state.readOnly)
          throw new SubscriptionRequiredException(
            state.reason ?? 'Tu plan no está activo',
          );
        return next.handle();
      }),
    );
  }
}
