import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer } from '../customers/customer.schema';
import { Conversation } from '../conversations/conversation.schema';
import { Message } from '../conversations/message.schema';
import { AiAgent } from '../ai-agents/ai-agent.schema';
import { LeadsService } from '../leads/leads.service';

/** Par nombre/valor de los desgloses (por canal, por etiqueta…). */
export interface DesgloseItem {
  key: string;
  label: string;
  count: number;
}

export interface CrmDashboard {
  contactos: {
    total: number;
    nuevosEsteMes: number;
    nuevosMesAnterior: number;
    conEtiquetas: number;
  };
  conversaciones: {
    abiertas: number;
    sinLeer: number;
    mensajesSinLeer: number;
    atendidasPorIa: number;
    activasHoy: number;
  };
  seguimiento: Awaited<ReturnType<LeadsService['stats']>>;
  agentes: {
    publicados: number;
    total: number;
    respuestasIa: number;
    respuestasHumanas: number;
    /** Porcentaje de respuestas salientes que resolvió la IA. */
    autonomia: number;
  };
  contactosPorCanal: DesgloseItem[];
  contactosPorEtiqueta: DesgloseItem[];
  conversacionesPorCanal: DesgloseItem[];
}

/** Cómo se llaman los canales de alta de un contacto en la interfaz. */
const ETIQUETA_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
  form: 'Formulario',
  event: 'Evento',
  reservation: 'Reserva',
  manual: 'Alta manual',
  import: 'Importación',
  mongodb: 'Importación externa',
  api: 'API',
};

/**
 * Resumen del CRM para la pantalla de inicio.
 *
 * Todo se resuelve con agregaciones en Mongo, no trayendo documentos a memoria:
 * un tenant con decenas de miles de contactos haría inviable lo segundo.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(Conversation.name) private convModel: Model<Conversation>,
    @InjectModel(Message.name) private msgModel: Model<Message>,
    @InjectModel(AiAgent.name) private agentModel: Model<AiAgent>,
    private leads: LeadsService,
  ) {}

  async crm(
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<CrmDashboard> {
    const tid = new Types.ObjectId(tenantId);
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const inicioMesAnterior = new Date(inicioMes);
    inicioMesAnterior.setMonth(inicioMesAnterior.getMonth() - 1);
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const [
      totalContactos,
      nuevosEsteMes,
      nuevosMesAnterior,
      conEtiquetas,
      porCanal,
      porEtiqueta,
      convAbiertas,
      convSinLeer,
      mensajesSinLeer,
      convIa,
      convHoy,
      convPorCanal,
      agentesPublicados,
      agentesTotal,
      respuestasIa,
      respuestasHumanas,
      seguimiento,
    ] = await Promise.all([
      this.customerModel.countDocuments({ tenantId: tid }),
      this.customerModel.countDocuments({
        tenantId: tid,
        createdAt: { $gte: inicioMes },
      }),
      this.customerModel.countDocuments({
        tenantId: tid,
        createdAt: { $gte: inicioMesAnterior, $lt: inicioMes },
      }),
      this.customerModel.countDocuments({
        tenantId: tid,
        'tags.0': { $exists: true },
      }),
      this.agrupar(this.customerModel, tid, '$source'),
      this.agruparEtiquetas(tid),
      this.convModel.countDocuments({ tenantId: tid, status: 'open' }),
      this.convModel.countDocuments({ tenantId: tid, unreadCount: { $gt: 0 } }),
      this.sumar(tid, 'unreadCount'),
      this.convModel.countDocuments({ tenantId: tid, autoReply: true }),
      this.convModel.countDocuments({
        tenantId: tid,
        lastMessageAt: { $gte: inicioHoy },
      }),
      this.agrupar(this.convModel, tid, '$channel'),
      this.agentModel.countDocuments({ tenantId: tid, published: true }),
      this.agentModel.countDocuments({ tenantId: tid }),
      this.msgModel.countDocuments({ tenantId: tid, author: 'agent' }),
      this.msgModel.countDocuments({ tenantId: tid, author: 'human' }),
      this.leads.stats(tenantId, userId, role),
    ]);

    const salientes = respuestasIa + respuestasHumanas;

    return {
      contactos: {
        total: totalContactos,
        nuevosEsteMes,
        nuevosMesAnterior,
        conEtiquetas,
      },
      conversaciones: {
        abiertas: convAbiertas,
        sinLeer: convSinLeer,
        mensajesSinLeer,
        atendidasPorIa: convIa,
        activasHoy: convHoy,
      },
      seguimiento,
      agentes: {
        publicados: agentesPublicados,
        total: agentesTotal,
        respuestasIa,
        respuestasHumanas,
        autonomia: salientes ? Math.round((respuestasIa / salientes) * 100) : 0,
      },
      contactosPorCanal: porCanal.map((d) => ({
        ...d,
        label: ETIQUETA_CANAL[d.key] ?? d.key,
      })),
      contactosPorEtiqueta: porEtiqueta,
      conversacionesPorCanal: convPorCanal.map((d) => ({
        ...d,
        label: ETIQUETA_CANAL[d.key] ?? d.key,
      })),
    };
  }

  /** Cuenta documentos por un campo simple, de mayor a menor. */
  private async agrupar(
    model: Model<Customer> | Model<Conversation>,
    tenantId: Types.ObjectId,
    campo: string,
  ): Promise<DesgloseItem[]> {
    const filas = await model.aggregate<{ _id: string; count: number }>([
      { $match: { tenantId } },
      { $group: { _id: campo, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return filas
      .filter((f) => f._id)
      .map((f) => ({ key: f._id, label: f._id, count: f.count }));
  }

  /** Las etiquetas son un array: hay que desplegarlo antes de agrupar. */
  private async agruparEtiquetas(
    tenantId: Types.ObjectId,
  ): Promise<DesgloseItem[]> {
    const filas = await this.customerModel.aggregate<{
      _id: string;
      count: number;
    }>([
      { $match: { tenantId, 'tags.0': { $exists: true } } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      // Una nube de etiquetas más larga no se lee; el resto vive en Contactos.
      { $limit: 12 },
    ]);
    return filas
      .filter((f) => f._id)
      .map((f) => ({ key: f._id, label: f._id, count: f.count }));
  }

  private async sumar(
    tenantId: Types.ObjectId,
    campo: string,
  ): Promise<number> {
    const [fila] = await this.convModel.aggregate<{ total: number }>([
      { $match: { tenantId } },
      { $group: { _id: null, total: { $sum: `$${campo}` } } },
    ]);
    return fila?.total ?? 0;
  }
}
