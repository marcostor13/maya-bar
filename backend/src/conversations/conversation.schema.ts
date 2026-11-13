import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { AdReferral } from '../shared/ad-referral';
import type { ConversationCampaign } from '../campaign-attribution/campaign-attribution';

export type ConversationChannel =
  | 'whatsapp'
  | 'instagram'
  | 'messenger'
  | 'email';

@Schema({ timestamps: true })
export class Conversation extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: ['whatsapp', 'instagram', 'messenger', 'email'],
    default: 'whatsapp',
  })
  channel: ConversationChannel;

  /** Cuenta (WhatsApp, Instagram, Messenger o correo) por la que entra/sale el chat. */
  @Prop({ type: Types.ObjectId, required: true, index: true })
  accountId: Types.ObjectId;

  /** Último agente que respondió (informativo). */
  @Prop({ type: Types.ObjectId, ref: 'AiAgent' })
  agentId?: Types.ObjectId;

  /** Identificador del cliente: número normalizado (WA), IGSID (Instagram), PSID (Messenger) o dirección de correo. */
  @Prop({ required: true, index: true })
  contact: string;

  /** chatId crudo del proveedor (ej. 5219991234567) para responder sin reconstruirlo. */
  @Prop()
  chatId?: string;

  @Prop()
  contactName?: string;

  /** Solo Messenger e Instagram; WhatsApp Cloud API no expone la foto. */
  @Prop()
  contactAvatar?: string;

  /**
   * Cuándo se trajo la foto. Las URLs de Meta llevan firma temporal, así que
   * pasada la ventana se vuelve a pedir el perfil; sin esta marca habría que
   * elegir entre llamar a Meta en cada mensaje o dejar avatares rotos.
   */
  @Prop({ type: Date })
  contactAvatarAt?: Date;

  @Prop({ type: Date, default: Date.now, index: true })
  lastMessageAt: Date;

  @Prop({ default: '' })
  lastMessagePreview: string;

  /** Correo: asunto del último mensaje del hilo, para mostrarlo y responder con "Re:". */
  @Prop()
  emailSubject?: string;

  @Prop({ enum: ['in', 'out'], default: 'in' })
  lastMessageDirection: string;

  @Prop({ default: 0 })
  unreadCount: number;

  /** Si está en true responde el agente IA; en false el chat está en modo manual. */
  @Prop({ default: true })
  autoReply: boolean;

  /**
   * El último turno del agente IA fue no responder ({{NO_RESPONDER}}). Mientras
   * esté en true no se le permite callar otra vez: responde al siguiente.
   */
  @Prop({ default: false })
  agentSilent: boolean;

  /**
   * Cuándo vence la espera para que el agente responda los mensajes
   * pendientes (cada mensaje nuevo la reinicia). Vacío = nada programado.
   */
  @Prop({ type: Date })
  agentDueAt?: Date;

  /** Candado con caducidad: una instancia está generando la respuesta. */
  @Prop({ type: Date })
  agentLockUntil?: Date;

  /**
   * Vendedor que atiende el chat. Solo él puede escribir; el resto del equipo
   * lo ve en solo lectura. Vacío con `autoReply` en false = chat en cola, sin
   * asignar.
   */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  takenOverBy?: Types.ObjectId;

  /** Nombre de quien lo atiende, copiado al asignar para no consultar usuarios en cada lista. */
  @Prop()
  takenOverByName?: string;

  @Prop({ type: Date })
  takenOverAt?: Date;

  @Prop({ enum: ['open', 'closed'], default: 'open' })
  status: string;

  /**
   * Anuncio del que salió el chat (Click-to-WhatsApp). Se graba con el primer
   * mensaje y NO se pisa después: la atribución es del anuncio que trajo al
   * cliente, no del último que volvió a tocar.
   */
  @Prop({ type: Object })
  adReferral?: AdReferral;

  /**
   * Campaña de la que vino el chat (primer toque): un anuncio de Meta o una
   * campaña de Maya que el contacto recibió hasta 30 días antes de escribir.
   */
  @Prop({ type: Object })
  campaign?: ConversationCampaign;

  /** Contacto del CRM al que se guardó esta conversación, si se guardó. */
  @Prop({ type: Types.ObjectId, ref: 'Customer', index: true })
  customerId?: Types.ObjectId;

  // --- Escalamiento a un agente humano ---

  /** true desde que el agente IA deriva el chat hasta que alguien lo reactiva. */
  @Prop({ default: false, index: true })
  escalated: boolean;

  @Prop({ type: Date })
  escalatedAt?: Date;

  /** Motivo que dio el agente IA al derivar. */
  @Prop()
  escalationReason?: string;

  /**
   * A quién se avisó, con su canal ("WhatsApp +51…", "correo a@b.c"). Las
   * derivaciones antiguas guardan solo el número de WhatsApp.
   */
  @Prop({ type: [String], default: [] })
  escalationNotifiedTo: string[];

  // --- Bloqueo ---

  /**
   * Contacto bloqueado: sus mensajes se descartan al llegar y desde la bandeja
   * no se le puede escribir. En WhatsApp también se bloquea en el proveedor.
   */
  @Prop({ default: false, index: true })
  blocked: boolean;

  @Prop({ type: Date })
  blockedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  blockedBy?: Types.ObjectId;

  @Prop()
  blockedReason?: string;

  /** true si el bloqueo también quedó aplicado en el canal (WhatsApp). */
  @Prop()
  blockedOnChannel?: boolean;

  // --- Papelera ---

  /**
   * En la papelera: oculta en toda la plataforma (ver `excludeTrash`) y se
   * borra definitivamente a los 30 días.
   */
  @Prop({ default: false })
  inTrash: boolean;

  @Prop({ type: Date, index: true })
  trashedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  trashedBy?: Types.ObjectId;

  @Prop()
  trashedByName?: string;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ tenantId: 1, lastMessageAt: -1 });
// Recuperación de respuestas programadas que nadie atendió (HU11).
ConversationSchema.index(
  { agentDueAt: 1 },
  { partialFilterExpression: { agentDueAt: { $exists: true } } },
);
ConversationSchema.index(
  { tenantId: 1, 'campaign.kind': 1, 'campaign.id': 1 },
  { sparse: true },
);
// Único solo fuera de la papelera: si el contacto vuelve a escribir mientras su
// chat viejo está en la papelera, se abre uno nuevo.
ConversationSchema.index(
  { channel: 1, accountId: 1, contact: 1 },
  { unique: true, partialFilterExpression: { inTrash: false } },
);

/** Filtro que deja fuera la papelera. */
export const NOT_IN_TRASH = { inTrash: { $ne: true } } as const;

/** ¿La consulta ya decide sobre la papelera? Entonces no se toca. */
function mentionsTrash(filter: Record<string, unknown> | undefined): boolean {
  return !!filter && Object.hasOwn(filter, 'inTrash');
}

/**
 * Las conversaciones en la papelera no existen para el resto de la plataforma
 * (bandeja, contadores, paneles, recuperación…). Para verlas, la consulta debe
 * filtrar por `inTrash` de forma explícita. `deleteOne`/`deleteMany` no se
 * filtran: la purga los necesita.
 */
ConversationSchema.pre(
  [
    'find',
    'findOne',
    'countDocuments',
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'distinct',
  ],
  function () {
    hideTrashInQuery(this);
  },
);

ConversationSchema.pre('aggregate', function () {
  hideTrashInPipeline(this.pipeline());
});

/** Añade el filtro de papelera a una consulta, salvo que ya decida sobre ella. */
export function hideTrashInQuery(query: {
  getFilter(): Record<string, unknown>;
  where(filter: Record<string, unknown>): unknown;
}): void {
  if (!mentionsTrash(query.getFilter())) query.where({ ...NOT_IN_TRASH });
}

/** Igual para un aggregate: un `$match` inicial, salvo que ya decida sobre ella. */
export function hideTrashInPipeline(pipeline: object[]): void {
  const first = pipeline[0] as { $match?: Record<string, unknown> } | undefined;
  if (first?.$match && mentionsTrash(first.$match)) return;
  pipeline.unshift({ $match: { ...NOT_IN_TRASH } });
}
