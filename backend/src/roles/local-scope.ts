import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { AuthReq } from '../auth/permissions';

/**
 * Restricción por local.
 *
 * Regla de oro: **`localIds` vacío significa "todos los locales"**. Es la única
 * lectura compatible con los datos actuales, donde todos los usuarios tienen el
 * array vacío porque nunca hubo pantalla para asignarlos. Solo cuando el
 * administrador asigna locales explícitamente empieza a filtrar.
 *
 * Los documentos sin `localId` (que en los cinco esquemas afectados es opcional)
 * siguen siendo visibles para todo el mundo: no tienen local al que pertenecer,
 * y esconderlos haría desaparecer datos que hoy se ven.
 */

export type LocalFilter = Record<string, unknown>;

/** Filtro de Mongo que acota a los locales del usuario. `{}` si no hay límite. */
export function localScope(
  user: AuthReq['user'],
  field = 'localId',
): LocalFilter {
  const ids = (user.localIds ?? []).filter((id) => Types.ObjectId.isValid(id));
  if (ids.length === 0) return {};

  return {
    $or: [
      { [field]: { $in: ids.map((id) => new Types.ObjectId(id)) } },
      { [field]: { $exists: false } },
      { [field]: null },
    ],
  };
}

/** ¿El usuario puede tocar algo de este local? */
export function canUseLocal(
  user: AuthReq['user'],
  localId?: string | Types.ObjectId | null,
): boolean {
  const ids = user.localIds ?? [];
  if (ids.length === 0) return true;
  if (!localId) return true;
  return ids.includes(String(localId));
}

/** Rechaza el acceso a un local que no esté asignado al usuario. */
export function assertLocalAllowed(
  user: AuthReq['user'],
  localId?: string | null,
): void {
  if (canUseLocal(user, localId)) return;
  throw new ForbiddenException('No tienes acceso a este local');
}
