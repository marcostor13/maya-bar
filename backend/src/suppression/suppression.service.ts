import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SuppressionEntry,
  SuppressionSource,
} from './suppression-entry.schema';
import { phoneDigits } from '../shared/phone';

/** Datos de contacto de una persona, tal como los guarda el CRM. */
export interface ContactKey {
  phone?: string | null;
  email?: string | null;
}

/** Conjunto de bajas del tenant, listo para filtrar en memoria. */
export interface SuppressionSet {
  phones: Set<string>;
  emails: Set<string>;
  /** true si no hay ninguna baja: permite saltarse el filtrado. */
  empty: boolean;
}

const EMPTY_SET: SuppressionSet = {
  phones: new Set(),
  emails: new Set(),
  empty: true,
};

/**
 * Lista de no contactar: quién pidió dejar de recibir comunicaciones.
 *
 * El filtro se aplica en el punto de salida de cada envío masivo, no al montar
 * la audiencia en pantalla: así ninguna forma de segmentar (todos, listas,
 * etiquetas) puede saltárselo.
 */
@Injectable()
export class SuppressionService {
  private readonly logger = new Logger(SuppressionService.name);

  constructor(
    @InjectModel(SuppressionEntry.name)
    private model: Model<SuppressionEntry>,
  ) {}

  /** Normaliza igual que el CRM guarda: dígitos para el teléfono, minúsculas para el email. */
  private keyOf(contact: ContactKey): { phone?: string; email?: string } {
    return {
      phone: phoneDigits(contact.phone ?? undefined),
      email: contact.email?.toLowerCase().trim() || undefined,
    };
  }

  async list(tenantId: string, q?: string): Promise<SuppressionEntry[]> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (q?.trim()) {
      const rx = new RegExp(
        q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter.$or = [{ name: rx }, { phone: rx }, { email: rx }, { reason: rx }];
    }
    return this.model.find(filter).sort({ createdAt: -1 }).limit(500).exec();
  }

  async count(tenantId: string): Promise<number> {
    return this.model.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
    });
  }

  /**
   * Da de baja a alguien. Idempotente: repetirlo actualiza el motivo en vez de
   * fallar por el índice único.
   */
  async add(
    tenantId: string,
    data: ContactKey & {
      name?: string;
      reason?: string;
      source?: SuppressionSource;
      userId?: string;
      conversationId?: string;
    },
  ): Promise<SuppressionEntry> {
    const { phone, email } = this.keyOf(data);
    if (!phone && !email)
      throw new BadRequestException(
        'Hace falta un teléfono o un email para dar de baja a alguien',
      );

    const tid = new Types.ObjectId(tenantId);
    // Si ya estaba de baja por cualquiera de los dos datos, se actualiza esa
    // entrada y se completa con el que faltara.
    const existing = await this.model.findOne({
      tenantId: tid,
      $or: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
    });

    const doc = existing ?? new this.model({ tenantId: tid });
    if (phone) doc.phone = phone;
    if (email) doc.email = email;
    if (data.name?.trim()) doc.name = data.name.trim();
    if (data.reason !== undefined) doc.reason = data.reason?.trim();
    doc.source = data.source ?? 'manual';
    if (data.userId) doc.createdBy = new Types.ObjectId(data.userId);
    if (data.conversationId)
      doc.conversationId = new Types.ObjectId(data.conversationId);
    return doc.save();
  }

  /** Reactiva a alguien por el id de la entrada. */
  async removeById(id: string, tenantId: string): Promise<{ removed: number }> {
    if (!Types.ObjectId.isValid(id)) return { removed: 0 };
    const res = await this.model.deleteOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });
    return { removed: res.deletedCount ?? 0 };
  }

  /** Reactiva por dato de contacto (lo que usa el interruptor del chat). */
  async removeByContact(
    tenantId: string,
    contact: ContactKey,
  ): Promise<{ removed: number }> {
    const { phone, email } = this.keyOf(contact);
    if (!phone && !email) return { removed: 0 };
    const res = await this.model.deleteMany({
      tenantId: new Types.ObjectId(tenantId),
      $or: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
    });
    return { removed: res.deletedCount ?? 0 };
  }

  /** ¿Esta persona pidió no recibir comunicaciones? */
  async isSuppressed(tenantId: string, contact: ContactKey): Promise<boolean> {
    const { phone, email } = this.keyOf(contact);
    if (!phone && !email) return false;
    const found = await this.model.exists({
      tenantId: new Types.ObjectId(tenantId),
      $or: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
    });
    return !!found;
  }

  /**
   * Todas las bajas del tenant en una sola consulta, para filtrar un envío
   * masivo sin una consulta por destinatario.
   */
  async setFor(tenantId: string): Promise<SuppressionSet> {
    const rows = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) }, { phone: 1, email: 1 })
      .lean()
      .exec();
    if (rows.length === 0) return EMPTY_SET;
    return {
      phones: new Set(rows.map((r) => r.phone).filter(Boolean) as string[]),
      emails: new Set(rows.map((r) => r.email).filter(Boolean) as string[]),
      empty: false,
    };
  }

  /** true si el contacto está en el conjunto de bajas ya cargado. */
  matches(set: SuppressionSet, contact: ContactKey): boolean {
    if (set.empty) return false;
    const { phone, email } = this.keyOf(contact);
    return (
      (!!phone && set.phones.has(phone)) || (!!email && set.emails.has(email))
    );
  }

  /**
   * Quita de una audiencia a quien pidió no recibir. Devuelve también cuántos
   * se descartaron, para poder decirlo en pantalla en vez de que desaparezcan
   * sin explicación.
   */
  async filterAllowed<T extends ContactKey>(
    tenantId: string,
    people: T[],
  ): Promise<{ allowed: T[]; blocked: number }> {
    const set = await this.setFor(tenantId);
    if (set.empty) return { allowed: people, blocked: 0 };
    const allowed = people.filter((p) => !this.matches(set, p));
    const blocked = people.length - allowed.length;
    if (blocked > 0)
      this.logger.log(
        `Lista de no contactar: ${blocked} destinatario(s) excluido(s).`,
      );
    return { allowed, blocked };
  }
}
