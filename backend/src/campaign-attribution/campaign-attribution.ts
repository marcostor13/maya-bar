import { Types, type Model } from 'mongoose';
import type { AdReferral } from '../shared/ad-referral';

/** Origen de campaña de una conversación (primer toque). */
export interface ConversationCampaign {
  /** `ad`: anuncio de Meta (Click-to-WhatsApp). `campaign`: campaña de Maya. */
  kind: 'ad' | 'campaign';
  /** Id del anuncio o de la campaña de Maya. */
  id: string;
  name: string;
  at: Date;
}

export type TouchChannel = 'phone' | 'email';

/** Días tras el envío en que una respuesta se atribuye a la campaña. */
export const ATTRIBUTION_WINDOW_DAYS = 30;
/** Los teléfonos se comparan por su final: los contactos traen formatos distintos. */
const PHONE_TAIL = 9;

/** Dirección comparable: últimos 9 dígitos del teléfono o email en minúsculas. */
export function touchAddress(
  channel: TouchChannel,
  value?: string | null,
): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  if (channel === 'email') return v.includes('@') ? v.toLowerCase() : null;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-PHONE_TAIL) : null;
}

/** Canal de toque que puede atribuir una conversación de ese canal. */
export function touchChannelFor(
  conversationChannel: string,
): TouchChannel | null {
  if (conversationChannel === 'whatsapp') return 'phone';
  if (conversationChannel === 'email') return 'email';
  return null;
}

/** Origen de un anuncio de Click-to-WhatsApp. */
export function campaignFromReferral(
  ref?: AdReferral | null,
): ConversationCampaign | null {
  if (!ref?.adId) return null;
  const name = (ref.headline || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return {
    kind: 'ad',
    id: ref.adId,
    name: name || `Anuncio ${ref.adId}`,
    at: ref.at ? new Date(ref.at) : new Date(),
  };
}

/** `ad:<id>` o `campaign:<ObjectId>`; cualquier otra cosa es inválida. */
export function parseCampaignFilter(
  value?: string | null,
): { kind: 'ad' | 'campaign'; id: string } | null {
  const m = /^(ad|campaign):([A-Za-z0-9_-]{1,64})$/.exec((value ?? '').trim());
  if (!m) return null;
  const kind = m[1] as 'ad' | 'campaign';
  if (kind === 'campaign' && !Types.ObjectId.isValid(m[2])) return null;
  return { kind, id: m[2] };
}

export const campaignKey = (c: { kind: string; id: string }) =>
  `${c.kind}:${c.id}`;

export interface CampaignOption {
  key: string;
  kind: string;
  id: string;
  name: string;
  count: number;
}

/**
 * Campañas de las que vienen las conversaciones de una empresa, con cuántas
 * hay de cada una (más recientes primero). Opcionalmente de un solo canal.
 * La usan la bandeja y la recuperación (cada una con su permiso).
 */
export async function listConversationCampaigns(
  convModel: Model<any>,
  tenantId: string,
  channel?: string,
): Promise<CampaignOption[]> {
  const match: Record<string, unknown> = {
    tenantId: new Types.ObjectId(tenantId),
    'campaign.id': { $exists: true },
  };
  if (channel && /^[a-z]+$/.test(channel)) match.channel = channel;
  const rows = await convModel
    .aggregate<{
      _id: { kind: string; id: string };
      name: string;
      count: number;
      last: Date;
    }>([
      { $match: match },
      { $sort: { 'campaign.at': -1 } },
      {
        $group: {
          _id: { kind: '$campaign.kind', id: '$campaign.id' },
          name: { $first: '$campaign.name' },
          count: { $sum: 1 },
          last: { $first: '$campaign.at' },
        },
      },
      { $sort: { last: -1 } },
      { $limit: 200 },
    ])
    .exec();
  return rows.map((r) => ({
    key: campaignKey(r._id),
    kind: r._id.kind,
    id: r._id.id,
    name: r.name,
    count: r.count,
  }));
}
