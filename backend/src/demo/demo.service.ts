import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { Connection, Model, Types } from 'mongoose';
import { Tenant } from '../tenants/tenant.schema';
import { User } from '../users/user.schema';
import { Customer } from '../customers/customer.schema';
import { Lead } from '../leads/lead.schema';
import { Conversation } from '../conversations/conversation.schema';
import { Message } from '../conversations/message.schema';
import { WhatsAppAccount } from '../whatsapp-accounts/whatsapp-account.schema';
import { AiAgent } from '../ai-agents/ai-agent.schema';
import { buildDemoData, DEMO_EMAIL, DEMO_SLUG } from './demo-data';

export interface DemoResetResult {
  tenantId: string;
  email: string;
  password: string;
  users: { name: string; email: string; role: string }[];
  counts: Record<string, number>;
}

/** Contraseña legible para dictarla en una llamada: sin 0/O ni 1/l. */
function demoPassword(): string {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

/** Empresa demo con datos ficticios para mostrar Maya CRM (HU86). */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    @InjectConnection() private connection: Connection,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(Customer.name) private customers: Model<Customer>,
    @InjectModel(Lead.name) private leads: Model<Lead>,
    @InjectModel(Conversation.name) private conversations: Model<Conversation>,
    @InjectModel(Message.name) private messages: Model<Message>,
    @InjectModel(WhatsAppAccount.name)
    private waAccounts: Model<WhatsAppAccount>,
    @InjectModel(AiAgent.name) private agents: Model<AiAgent>,
  ) {}

  async reset(now = new Date()): Promise<DemoResetResult> {
    const data = buildDemoData(now);
    const emails = data.users.map((u) => String(u.email));

    // Solo se toca lo que es demo: si el slug, el correo de la empresa o el de
    // algún usuario pertenece a otra cosa, no se borra nada.
    const clash = await this.tenants
      .find({ $or: [{ slug: DEMO_SLUG }, { email: DEMO_EMAIL }] })
      .select('_id demo')
      .lean<{ _id: Types.ObjectId; demo?: boolean }[]>()
      .exec();
    if (clash.some((t) => t.demo !== true))
      throw new ConflictException(
        'Ya existe una empresa real con el correo o el nombre de la demo',
      );
    const old = clash.map((t) => t._id);
    const others = await this.users
      .find({ email: { $in: emails }, tenantId: { $nin: old } })
      .select('tenantId')
      .lean<{ tenantId?: Types.ObjectId }[]>()
      .exec();
    // Restos de un restablecimiento que falló a mitad: usuarios de la demo cuya
    // empresa no llegó a crearse. Se limpian; si su empresa existe, es real.
    const orphanIds: Types.ObjectId[] = [];
    for (const u of others) {
      const exists =
        u.tenantId && (await this.tenants.exists({ _id: u.tenantId }).exec());
      if (exists || !u.tenantId)
        throw new ConflictException(
          'Un usuario fuera de la demo ya usa uno de sus correos',
        );
      orphanIds.push(u.tenantId);
    }

    for (const id of old) await this.wipe(id);
    for (const id of orphanIds) await this.purge(id);

    const password = demoPassword();
    const hash = await bcrypt.hash(password, 10);
    let counts: Record<string, number>;
    try {
      counts = await this.insertAll(data, hash);
    } catch (err) {
      // Sin transacción: si algo falla, se borra lo que alcanzó a insertarse.
      await this.purge(data.tenant._id);
      throw err;
    }

    const tenantId = String(data.tenant._id);
    this.logger.log(`Demo restablecida: ${tenantId} ${JSON.stringify(counts)}`);
    return {
      tenantId,
      email: DEMO_EMAIL,
      password,
      users: data.users.map((u) => ({
        name: String(u.name),
        email: String(u.email),
        role: String(u.role),
      })),
      counts,
    };
  }

  private async insertAll(
    data: ReturnType<typeof buildDemoData>,
    hash: string,
  ): Promise<Record<string, number>> {
    const counts = {
      users: await this.insert(
        this.users,
        data.users.map((u) => ({ ...u, password: hash })),
      ),
      whatsappAccounts: await this.insert(this.waAccounts, [
        data.whatsappAccount,
      ]),
      agents: await this.insert(this.agents, [data.agent]),
      customers: await this.insert(this.customers, data.customers),
      conversations: await this.insert(this.conversations, data.conversations),
      messages: await this.insert(this.messages, data.messages),
      leads: await this.insert(this.leads, data.leads),
    };
    // La empresa al final: si algo falla antes, no queda una demo a medias visible.
    await this.insert(this.tenants, [data.tenant]);
    return counts;
  }

  /** Borra todo lo que cuelga de la empresa demo, en cualquier colección. */
  private async wipe(tenantId: Types.ObjectId) {
    const tenant = await this.tenants
      .findById(tenantId)
      .select('demo')
      .lean<{ demo?: boolean }>()
      .exec();
    if (tenant?.demo !== true) return;
    await this.purge(tenantId);
    await this.tenants.deleteOne({ _id: tenantId, demo: true }).exec();
  }

  /** Borra los datos con ese `tenantId` (no la empresa). Solo para ids de la demo. */
  private async purge(tenantId: Types.ObjectId) {
    const db = this.connection.db!;
    const cols = await db.listCollections({}, { nameOnly: true }).toArray();
    for (const { name } of cols) {
      if (name.startsWith('system.')) continue;
      await db
        .collection(name)
        .deleteMany({ tenantId: { $in: [tenantId, String(tenantId)] } });
    }
  }

  /**
   * Inserta con el modelo real (valida y aplica valores por defecto) pero
   * conservando las fechas históricas, que `save` pisaría con los timestamps.
   */
  private async insert<T>(model: Model<T>, docs: object[]): Promise<number> {
    const rows = docs.map((d) => {
      const doc = new model(d);
      const err = doc.validateSync();
      if (err) throw err;
      return doc.toObject({ depopulate: true }) as Record<string, unknown>;
    });
    if (rows.length) await model.collection.insertMany(rows);
    return rows.length;
  }
}
