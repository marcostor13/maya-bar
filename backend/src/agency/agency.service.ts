import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tenant } from '../tenants/tenant.schema';
import { TenantsService } from '../tenants/tenants.service';
import { User } from '../users/user.schema';
import { Customer } from '../customers/customer.schema';
import { Conversation } from '../conversations/conversation.schema';
import { normalizeDomain } from '../api-access/api-access.service';
import {
  addPanelDomain,
  brandForTenant,
  brandOf,
  setPanelDomains,
  type Brand,
} from './white-label';
import type { AuthReq } from '../auth/permissions';

export interface WhiteLabelInput {
  appName?: string;
  logo?: string;
  favicon?: string;
  primaryColor?: string;
  panelDomain?: string;
}

/**
 * Agencias y sub-cuentas (HU72). Una agencia es una empresa con `agency`; sus
 * clientes son empresas con `parentTenantId`. El administrador de la agencia
 * entra a cada una sin volver a iniciar sesión (ver AuthService.switchTenant).
 */
@Injectable()
export class AgencyService implements OnModuleInit {
  constructor(
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(Customer.name) private customers: Model<Customer>,
    @InjectModel(Conversation.name) private convs: Model<Conversation>,
    private tenantsService: TenantsService,
  ) {}

  async onModuleInit() {
    const rows = await this.tenants
      .find({ 'whiteLabel.panelDomain': { $exists: true, $ne: '' } })
      .select('whiteLabel.panelDomain')
      .lean<Tenant[]>()
      .exec();
    setPanelDomains(rows.map((r) => r.whiteLabel?.panelDomain ?? ''));
  }

  /** La agencia del usuario: su empresa propia, aunque esté dentro de un cliente. */
  async agencyOf(user: AuthReq['user']) {
    if (user.role !== 'TENANT_ADMIN')
      throw new ForbiddenException('Solo el administrador de la agencia');
    const home = user.homeTenantId ?? user.tenantId;
    const t = Types.ObjectId.isValid(home)
      ? await this.tenants.findById(home).exec()
      : null;
    if (!t?.agency)
      throw new ForbiddenException('Tu empresa no tiene el plan Agencia');
    return t;
  }

  async overview(user: AuthReq['user']) {
    const agency = await this.agencyOf(user);
    const clients = await this.tenants
      .find({ parentTenantId: agency._id })
      .select('name email plan isActive createdAt')
      .sort({ name: 1 })
      .lean<(Tenant & { createdAt: Date })[]>()
      .exec();
    const ids = clients.map((c) => c._id);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const count = async (model: Model<any>, extra: Record<string, unknown>) =>
      new Map(
        (
          await model
            .aggregate<{
              _id: Types.ObjectId;
              n: number;
            }>([
              { $match: { tenantId: { $in: ids }, ...extra } },
              { $group: { _id: '$tenantId', n: { $sum: 1 } } },
            ])
            .exec()
        ).map((r) => [String(r._id), r.n]),
      );
    const [users, contacts, convs] = await Promise.all([
      count(this.users, {}),
      count(this.customers, {}),
      count(this.convs, { lastMessageAt: { $gte: since } }),
    ]);
    return {
      agency: {
        _id: String(agency._id),
        name: agency.name,
        seats: agency.agency!.seats,
        used: clients.length,
      },
      whiteLabel: agency.whiteLabel ?? {},
      actingTenantId: user.homeTenantId ? user.tenantId : null,
      clients: clients.map((c) => {
        const id = String(c._id);
        return {
          _id: id,
          name: c.name,
          email: c.email,
          plan: c.plan,
          isActive: c.isActive !== false,
          createdAt: c.createdAt,
          usage: {
            users: users.get(id) ?? 0,
            contacts: contacts.get(id) ?? 0,
            conversations30d: convs.get(id) ?? 0,
          },
        };
      }),
    };
  }

  /** Alta de un cliente como sub-cuenta: la paga la agencia, sin prueba. */
  async createClient(user: AuthReq['user'], name: string, email: string) {
    const agency = await this.agencyOf(user);
    const used = await this.tenants.countDocuments({
      parentTenantId: agency._id,
    });
    if (used >= agency.agency!.seats)
      throw new ForbiddenException(
        `Tu plan incluye ${agency.agency!.seats} sub-cuentas. Pide sub-cuentas extra para crear más.`,
      );
    let child: Tenant;
    try {
      child = await this.tenantsService.create({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        plan: 'crece',
      });
    } catch (err) {
      if (err instanceof ConflictException)
        throw new ConflictException(
          'Ya existe una empresa con ese nombre o ese correo',
        );
      throw err;
    }
    await this.tenants.updateOne(
      { _id: child._id },
      {
        $set: { parentTenantId: agency._id, plan: 'crece' },
        $unset: { trialEndsAt: 1, subscription: 1 },
      },
    );
    return { _id: String(child._id), name: child.name, email: child.email };
  }

  async updateWhiteLabel(user: AuthReq['user'], input: WhiteLabelInput) {
    const agency = await this.agencyOf(user);
    const wl = { ...(agency.whiteLabel ?? {}) };
    if (input.appName !== undefined) wl.appName = input.appName.trim();
    for (const k of ['logo', 'favicon'] as const)
      if (input[k] !== undefined) {
        const v = input[k].trim();
        if (v && !/^https:\/\//i.test(v))
          throw new BadRequestException(
            'El logo y el ícono van en una URL https',
          );
        wl[k] = v;
      }
    if (input.primaryColor !== undefined) wl.primaryColor = input.primaryColor;
    if (input.panelDomain !== undefined) {
      const d = input.panelDomain.trim()
        ? normalizeDomain(input.panelDomain)
        : '';
      if (d === undefined || d?.startsWith('*.'))
        throw new BadRequestException('Dominio del panel inválido');
      if (
        d &&
        (await this.tenants.exists({
          _id: { $ne: agency._id },
          'whiteLabel.panelDomain': d,
        }))
      )
        throw new ConflictException('Ese dominio ya lo usa otra agencia');
      wl.panelDomain = d;
    }
    agency.whiteLabel = wl;
    agency.markModified('whiteLabel');
    await agency.save();
    await this.onModuleInit();
    addPanelDomain(wl.panelDomain);
    return wl;
  }

  /** Superadmin: activa o quita el plan Agencia y fija las sub-cuentas incluidas. */
  async setAgency(tenantId: string, seats: number) {
    if (!Types.ObjectId.isValid(tenantId))
      throw new NotFoundException('Empresa no encontrada');
    const t = await this.tenants.findById(tenantId).exec();
    if (!t) throw new NotFoundException('Empresa no encontrada');
    if (t.parentTenantId)
      throw new BadRequestException('Una sub-cuenta no puede ser agencia');
    if (seats > 0) t.agency = { seats };
    else t.agency = undefined;
    t.markModified('agency');
    await t.save();
    return { _id: String(t._id), agency: t.agency ?? null };
  }

  /** Marca del panel según el dominio en que se abre (pública). */
  async brandForHost(host: string): Promise<Brand | null> {
    const d = normalizeDomain(host ?? '');
    if (!d) return null;
    const t = await this.tenants
      .findOne({ 'whiteLabel.panelDomain': d, agency: { $exists: true } })
      .select('whiteLabel name')
      .lean<Tenant>()
      .exec();
    return t ? brandOf(t) : null;
  }

  async isAgency(user: AuthReq['user']): Promise<boolean> {
    if (user.role !== 'TENANT_ADMIN') return false;
    const home = user.homeTenantId ?? user.tenantId;
    return (
      Types.ObjectId.isValid(home) &&
      !!(await this.tenants
        .exists({ _id: new Types.ObjectId(home), agency: { $exists: true } })
        .exec())
    );
  }

  /** Marca de la empresa en sesión: la de su agencia si es una sub-cuenta. */
  brandForTenant(tenantId: string): Promise<Brand> {
    return brandForTenant(this.tenants, tenantId);
  }
}
