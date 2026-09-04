import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  mixin,
  Type,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import type { AuthReq } from '../auth/permissions';
import { ACTION_LABELS, MODULES, actionForMethod } from './modules.catalog';

export const MODULE_KEY = 'platform_module';

/**
 * Exige que el rol del usuario tenga acceso al módulo, según la matriz que la
 * empresa haya configurado.
 *
 * Va DESPUÉS de `JwtAuthGuard` y ANTES de cualquier `assertRole` que quede: la
 * matriz decide el acceso al módulo, y `assertRole` sigue cubriendo las reglas
 * más finas dentro de él mientras dure la migración.
 */
export function ModuleGuard(moduleKey: string): Type<CanActivate> {
  @Injectable()
  class Guard implements CanActivate {
    constructor(readonly roles: RolesService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const req = context
        .switchToHttp()
        .getRequest<AuthReq & { method?: string }>();
      const user = req.user;
      // Sin sesión no llega aquí: JwtAuthGuard responde antes.
      if (!user?.role) return false;
      if (user.role === 'SUPERADMIN') return true;

      const { modules, actions } = await this.roles.accessFor(
        user.tenantId,
        user.role,
      );
      const label =
        MODULES.find((m) => m.key === moduleKey)?.label ?? moduleKey;
      if (!modules.includes(moduleKey))
        throw new ForbiddenException(`Tu rol no tiene acceso a ${label}`);

      // El verbo HTTP dice qué se está intentando hacer, así que no hace falta
      // anotar cada endpoint. GET no se restringe: verlo ya lo concede el módulo.
      const action = actionForMethod(req.method ?? 'GET');
      if (!action) return true;

      const allowed = actions?.[moduleKey];
      // Sin entrada configurada se permiten todas: es lo que conserva intactos
      // los roles que se configuraron antes de que existieran las acciones.
      if (allowed === undefined || allowed.includes(action)) return true;

      throw new ForbiddenException(
        `Tu rol puede ver ${label}, pero no ${ACTION_LABELS[action].toLowerCase()}`,
      );
    }
  }
  return mixin(Guard);
}

/** Azúcar para marcar el módulo de un controlador entero. */
export const PlatformModule = (moduleKey: string) =>
  SetMetadata(MODULE_KEY, moduleKey);
