import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from './role.schema';
import {
  ADMIN_LOCKED_MODULES,
  DEFAULT_ROLE_MODULES,
  MODULES,
  MODULE_KEYS,
  ROLE_LABELS,
  ACTIONS,
  visibleModules,
} from './modules.catalog';

/**
 * Cuánto tarda como mucho en aplicarse un cambio de permisos. Corto a
 * propósito: los permisos no viajan en el JWT justamente para poder revocarlos
 * sin esperar a que caduque el token.
 */
const CACHE_TTL_MS = 30_000;

/** Lo que un rol puede ver y hacer. */
export interface RoleAccess {
  modules: string[];
  /** módulo -> acciones permitidas. Sin entrada = todas. */
  actions: Record<string, string[]>;
}

interface CacheEntry {
  access: RoleAccess;
  expiresAt: number;
}

@Injectable()
export class RolesService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@InjectModel(Role.name) private roleModel: Model<Role>) {}

  /** El catálogo completo, para pintar la matriz. */
  catalog() {
    return { modules: MODULES };
  }

  /**
   * Roles de la empresa, sembrando los que falten. Idempotente: si un rol ya
   * existe no se toca, así que ejecutarlo mil veces no pisa configuraciones.
   */
  async findAll(tenantId: string): Promise<Role[]> {
    const tid = new Types.ObjectId(tenantId);
    const existing = await this.roleModel.find({ tenantId: tid }).exec();
    const present = new Set(existing.map((r) => r.key));

    const missing = Object.entries(DEFAULT_ROLE_MODULES).filter(
      ([key]) => !present.has(key),
    );

    if (missing.length) {
      await this.roleModel.insertMany(
        missing.map(([key, modules]) => ({
          tenantId: tid,
          key,
          label: ROLE_LABELS[key] ?? key,
          modules: [...modules],
          isSystem: true,
        })),
        // `ordered: false` para que dos peticiones simultáneas no se estorben:
        // el índice único rechaza el duplicado y el resto se inserta igual.
        { ordered: false },
      ).catch(() => undefined);
      return this.roleModel.find({ tenantId: tid }).sort({ key: 1 }).exec();
    }

    return existing.sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Módulos a los que accede un rol. Es la consulta caliente: va con caché. */
  async modulesFor(tenantId: string, roleKey: string): Promise<string[]> {
    return (await this.accessFor(tenantId, roleKey)).modules;
  }

  /**
   * Módulos y acciones de un rol, resueltos juntos porque salen del mismo
   * documento y comparten caché.
   */
  async accessFor(tenantId: string, roleKey: string): Promise<RoleAccess> {
    // El superadministrador es de plataforma, no de empresa: no pasa por aquí.
    if (roleKey === 'SUPERADMIN') return { modules: MODULE_KEYS, actions: {} };

    const cacheKey = `${tenantId}:${roleKey}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.access;

    const role = await this.roleModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), key: roleKey })
      .exec();

    // Sin documento todavía (empresa que aún no ha abierto la pantalla) se usa
    // la matriz de partida: nadie se queda sin menú por no haber sembrado.
    // `visibleModules` filtra los módulos retirados del catálogo. Es necesario
    // aquí y no solo en el catálogo porque las empresas creadas antes del
    // cambio tienen esas claves guardadas en su documento de rol.
    const access: RoleAccess = {
      modules: visibleModules(
        this.withLockedModules(
          roleKey,
          role ? role.modules : (DEFAULT_ROLE_MODULES[roleKey] ?? []),
        ),
      ),
      actions: role?.actions ?? {},
    };

    this.cache.set(cacheKey, { access, expiresAt: Date.now() + CACHE_TTL_MS });
    return access;
  }

  /**
   * ¿Puede este rol ejecutar la acción dentro del módulo?
   *
   * Sin entrada en `actions` se permiten todas: así, un rol configurado antes de
   * que existieran las acciones conserva los permisos completos que tenía.
   */
  async canAct(
    tenantId: string,
    roleKey: string,
    moduleKey: string,
    action: string,
  ): Promise<boolean> {
    if (roleKey === 'SUPERADMIN') return true;
    const { actions } = await this.accessFor(tenantId, roleKey);
    const allowed = actions?.[moduleKey];
    return allowed === undefined ? true : allowed.includes(action);
  }

  async update(
    tenantId: string,
    key: string,
    modules: string[],
    actions?: Record<string, string[]>,
  ): Promise<Role> {
    const unknown = modules.filter((m) => !MODULE_KEYS.includes(m));
    if (unknown.length)
      throw new BadRequestException(
        `Módulos desconocidos: ${unknown.join(', ')}`,
      );

    if (actions) {
      for (const [mod, list] of Object.entries(actions)) {
        const bad = list.filter((a) => !ACTIONS.includes(a as never));
        if (bad.length)
          throw new BadRequestException(
            `Acciones desconocidas en ${mod}: ${bad.join(', ')}`,
          );
      }
    }

    // Sembrar primero: editar un rol que aún no existe debe funcionar igual.
    await this.findAll(tenantId);

    const finalModules = this.withLockedModules(key, modules);
    const set: Record<string, unknown> = { modules: finalModules };
    if (actions) {
      // Guardar acciones de módulos que el rol ya no tiene solo genera basura.
      set['actions'] = Object.fromEntries(
        Object.entries(actions).filter(([mod]) => finalModules.includes(mod)),
      );
    }

    const role = await this.roleModel
      .findOneAndUpdate(
        { tenantId: new Types.ObjectId(tenantId), key },
        { $set: set },
        { new: true },
      )
      .exec();
    if (!role) throw new NotFoundException('Rol no encontrado');

    this.cache.delete(`${tenantId}:${key}`);
    return role;
  }

  // -- Roles propios --------------------------------------------------------

  /**
   * Crea un rol de la empresa. La clave se deriva del nombre y lleva prefijo
   * para no chocar nunca con un rol del sistema, presente o futuro.
   */
  async create(tenantId: string, label: string): Promise<Role> {
    const clean = label.trim();
    if (!clean) throw new BadRequestException('El rol necesita un nombre');

    const key = this.keyFrom(clean);
    if (!key) throw new BadRequestException('El nombre no es válido');

    await this.findAll(tenantId);
    const exists = await this.roleModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), key })
      .exec();
    if (exists) throw new ConflictException('Ya existe un rol con ese nombre');

    return this.roleModel.create({
      tenantId: new Types.ObjectId(tenantId),
      key,
      label: clean,
      // Arranca sin acceso a nada: más seguro que heredar permisos por error.
      modules: [],
      actions: {},
      isSystem: false,
    });
  }

  /**
   * Borra un rol propio. No se permite si algún usuario lo tiene todavía:
   * quedaría con un rol inexistente y sin acceso a ninguna pantalla.
   */
  async remove(
    tenantId: string,
    key: string,
    usersWithRole: number,
  ): Promise<void> {
    const role = await this.roleModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), key })
      .exec();
    if (!role) throw new NotFoundException('Rol no encontrado');
    if (role.isSystem)
      throw new BadRequestException(
        'Los roles del sistema no se pueden eliminar; quítales los módulos si no los usas',
      );
    if (usersWithRole > 0)
      throw new ConflictException(
        `${usersWithRole} usuario(s) tienen este rol. Cámbialos de rol antes de eliminarlo.`,
      );

    await this.roleModel.deleteOne({ _id: role._id }).exec();
    this.cache.delete(`${tenantId}:${key}`);
  }

  /** Claves válidas para asignar a un usuario de esta empresa. */
  async assignableKeys(tenantId: string): Promise<string[]> {
    const roles = await this.findAll(tenantId);
    return roles.map((r) => r.key);
  }

  private keyFrom(label: string): string {
    const slug = label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);
    return slug ? `CUSTOM_${slug}` : '';
  }

  /**
   * El administrador conserva siempre los módulos bloqueados. Se aplica al
   * guardar y al leer, para que una configuración antigua tampoco pueda
   * dejar a la empresa sin acceso a Usuarios.
   */
  private withLockedModules(roleKey: string, modules: string[]): string[] {
    if (roleKey !== 'TENANT_ADMIN') return modules;
    return [...new Set([...modules, ...ADMIN_LOCKED_MODULES])];
  }
}
