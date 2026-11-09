import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, type PushPrefs } from '../users/user.schema';
import { RolesService } from '../roles/roles.service';

/** Tipos de aviso que el usuario puede apagar en Configuración. */
export const PUSH_CATEGORIES = [
  'chats',
  'forms',
  'leads',
  'recovery',
  'calls',
] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

/** Tipo de aviso que corresponde a cada módulo. */
const MODULE_CATEGORY: Record<string, PushCategory> = {
  inbox: 'chats',
  forms: 'forms',
  leads: 'leads',
  campaigns: 'recovery',
  calls: 'calls',
};

export function categoryForModule(moduleKey: string): PushCategory | undefined {
  return MODULE_CATEGORY[moduleKey];
}

/** Módulo que hay que tener para recibir cada tipo de aviso. */
const CATEGORY_MODULE: Record<PushCategory, string> = {
  chats: 'inbox',
  forms: 'forms',
  leads: 'leads',
  recovery: 'campaigns',
  calls: 'calls',
};

/** ¿Las preferencias dejan pasar este aviso? Sin categoría (prueba) siempre. */
export function prefsAllow(
  prefs: PushPrefs | undefined,
  category?: PushCategory,
): boolean {
  if (!category) return true;
  if (prefs?.muted) return false;
  return prefs?.[category] !== false;
}

type Candidate = Pick<User, 'role' | 'pushPrefs' | 'tenantId'> & {
  _id: Types.ObjectId;
};

/**
 * Decide quién recibe cada aviso push. Lo usan los dos canales (Web Push y
 * FCM) para que un mismo evento llegue exactamente a las mismas personas.
 *
 * Se mira el rol ACTUAL del usuario, no el que tenía al suscribirse: un permiso
 * revocado debe cortar los avisos en el acto. Nunca lanza: si la base falla,
 * no se avisa a nadie y la operación que originó el aviso sigue.
 */
@Injectable()
export class PushAudienceService {
  private readonly logger = new Logger(PushAudienceService.name);

  constructor(
    @InjectModel(User.name) private users: Model<User>,
    private roles: RolesService,
  ) {}

  /**
   * Usuarios concretos (p. ej. el dueño del chat) que quieren este aviso y
   * siguen teniendo el módulo del tipo de aviso en su rol. Sin categoría
   * (prueba) basta con que estén activos.
   */
  async forUsers(
    userIds: (string | Types.ObjectId)[],
    category?: PushCategory,
  ): Promise<string[]> {
    const ids = userIds
      .map(String)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (!ids.length) return [];
    try {
      const rows = await this.users
        .find({ _id: { $in: ids }, isActive: true })
        .select('role pushPrefs tenantId')
        .lean<Candidate[]>();
      const out: string[] = [];
      for (const u of rows) {
        if (!prefsAllow(u.pushPrefs, category)) continue;
        if (category && !(await this.roleHas(u, CATEGORY_MODULE[category])))
          continue;
        out.push(String(u._id));
      }
      return out;
    } catch (err) {
      this.logger.error(`No se pudo resolver destinatarios: ${String(err)}`);
      return [];
    }
  }

  /** Equipo de la empresa con acceso al módulo que quiere este aviso. */
  async forModule(
    tenantId: string | Types.ObjectId,
    moduleKey: string,
    opts: { category?: PushCategory; excludeUserId?: string } = {},
  ): Promise<string[]> {
    const tenant = String(tenantId);
    if (!Types.ObjectId.isValid(tenant)) return [];
    const category = opts.category ?? categoryForModule(moduleKey);
    try {
      const rows = await this.users
        .find({ tenantId: new Types.ObjectId(tenant), isActive: true })
        .select('role pushPrefs')
        .lean<Candidate[]>();

      // La matriz de módulos se resuelve una vez por rol, no una por usuario.
      const roleAllows = new Map<string, boolean>();
      const out: string[] = [];
      for (const u of rows) {
        const id = String(u._id);
        if (opts.excludeUserId && id === opts.excludeUserId) continue;
        if (!u.role || !prefsAllow(u.pushPrefs, category)) continue;
        if (!roleAllows.has(u.role)) {
          const modules = await this.roles.modulesFor(tenant, u.role);
          roleAllows.set(u.role, modules.includes(moduleKey));
        }
        if (roleAllows.get(u.role)) out.push(id);
      }
      return out;
    } catch (err) {
      this.logger.error(`No se pudo resolver destinatarios: ${String(err)}`);
      return [];
    }
  }

  /** ¿El rol actual del usuario tiene el módulo? */
  private async roleHas(u: Candidate, moduleKey: string): Promise<boolean> {
    if (!u.role) return false;
    if (u.role === 'SUPERADMIN') return true;
    if (!u.tenantId) return false;
    const modules = await this.roles.modulesFor(String(u.tenantId), u.role);
    return modules.includes(moduleKey);
  }

  async getPrefs(userId: string): Promise<Required<PushPrefs>> {
    const u = await this.users
      .findById(userId)
      .select('pushPrefs')
      .lean<{ pushPrefs?: PushPrefs }>();
    return withDefaults(u?.pushPrefs);
  }

  async setPrefs(
    userId: string,
    prefs: PushPrefs,
  ): Promise<Required<PushPrefs>> {
    const clean: PushPrefs = {};
    for (const k of [...PUSH_CATEGORIES, 'muted'] as const)
      if (typeof prefs[k] === 'boolean') clean[k] = prefs[k];
    const set = Object.fromEntries(
      Object.entries(clean).map(([k, v]) => [`pushPrefs.${k}`, v]),
    );
    if (!Object.keys(set).length) return this.getPrefs(userId);
    const u = await this.users
      .findByIdAndUpdate(userId, { $set: set }, { new: true })
      .select('pushPrefs')
      .lean<{ pushPrefs?: PushPrefs }>();
    return withDefaults(u?.pushPrefs);
  }
}

function withDefaults(p: PushPrefs | undefined): Required<PushPrefs> {
  return {
    chats: p?.chats !== false,
    forms: p?.forms !== false,
    leads: p?.leads !== false,
    recovery: p?.recovery !== false,
    calls: p?.calls !== false,
    muted: p?.muted === true,
  };
}
