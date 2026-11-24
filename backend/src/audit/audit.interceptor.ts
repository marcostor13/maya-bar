import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import {
  AUDIT_KEY,
  type AuditOptions,
  type AuditRequest,
} from './audit.decorator';
import { AuditService } from './audit.service';

export function requestIp(req: AuditRequest): string | undefined {
  const fwd = req.headers?.['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.ip;
}

export function requestUa(req: AuditRequest): string | undefined {
  const ua = req.headers?.['user-agent'];
  return Array.isArray(ua) ? ua[0] : ua;
}

/** Interceptor global: las rutas con `@Audit(...)` dejan registro al terminar bien. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opts = this.reflector.get<AuditOptions | undefined>(
      AUDIT_KEY,
      ctx.getHandler(),
    );
    if (!opts || ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<AuditRequest>();
    return next.handle().pipe(
      tap((result) => {
        const u = req.user ?? {};
        const params = req.params ?? {};
        const body = req.body ?? {};
        const fromBody = Object.fromEntries(
          (opts.bodyFields ?? [])
            .filter((k) => body[k] !== undefined)
            .map((k) => [k, body[k]]),
        );
        const tenantId =
          (opts.tenantParam && params[opts.tenantParam]) || u.tenantId || null;
        void this.audit.log({
          tenantId,
          userId: u.userId,
          actorEmail: u.email,
          actorRole: u.role,
          action: opts.action,
          resource: opts.resource,
          resourceId: params[opts.idParam ?? 'id'],
          details: {
            ...fromBody,
            ...(opts.details?.(req, result) ?? {}),
            ...(req.auditDetails ?? {}),
          },
          ip: requestIp(req),
          userAgent: requestUa(req),
        });
      }),
    );
  }
}
