import {
  CallHandler,
  ExecutionContext,
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
      SAFE_METHODS.includes(req.method) ||
      ALWAYS_ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))
    )
      return next.handle();

    return from(this.access.access(tenantId)).pipe(
      switchMap((state) => {
        if (state.readOnly)
          throw new SubscriptionRequiredException(
            state.reason ?? 'Tu plan no está activo',
          );
        return next.handle();
      }),
    );
  }
}
