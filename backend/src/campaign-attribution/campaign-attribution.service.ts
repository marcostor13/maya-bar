import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CampaignTouch } from './campaign-touch.schema';
import {
  ATTRIBUTION_WINDOW_DAYS,
  touchAddress,
  touchChannelFor,
  type ConversationCampaign,
  type TouchChannel,
} from './campaign-attribution';

/**
 * Recuerda a quién le llegó cada campaña de Maya para atribuirle la
 * conversación cuando esa persona escriba.
 */
@Injectable()
export class CampaignAttributionService {
  private readonly logger = new Logger(CampaignAttributionService.name);

  constructor(
    @InjectModel(CampaignTouch.name) private touchModel: Model<CampaignTouch>,
  ) {}

  /**
   * Registra envíos exitosos. Nunca lanza: un fallo aquí no puede tumbar el
   * envío de la campaña.
   */
  async recordTouches(
    tenantId: string | Types.ObjectId,
    campaign: { _id: unknown; name: string },
    channel: TouchChannel,
    addresses: (string | null | undefined)[],
    at = new Date(),
  ): Promise<number> {
    const unique = [
      ...new Set(
        addresses
          .map((a) => touchAddress(channel, a))
          .filter((a): a is string => !!a),
      ),
    ];
    if (!unique.length) return 0;
    try {
      await this.touchModel.insertMany(
        unique.map((address) => ({
          tenantId: new Types.ObjectId(String(tenantId)),
          campaignId: new Types.ObjectId(String(campaign._id)),
          campaignName: campaign.name,
          channel,
          address,
          at,
        })),
        { ordered: false },
      );
      return unique.length;
    } catch (err) {
      this.logger.warn(
        `No se pudieron registrar los envíos de la campaña ${String(campaign._id)}: ${String(err)}`,
      );
      return 0;
    }
  }

  /** Campaña más reciente que recibió ese contacto dentro de la ventana. */
  async lookup(
    tenantId: string | Types.ObjectId,
    conversationChannel: string,
    contact: string,
    now = new Date(),
  ): Promise<ConversationCampaign | null> {
    const channel = touchChannelFor(conversationChannel);
    const address = channel ? touchAddress(channel, contact) : null;
    if (!channel || !address) return null;
    const since = new Date(
      now.getTime() - ATTRIBUTION_WINDOW_DAYS * 86_400_000,
    );
    const touch = await this.touchModel
      .findOne({
        tenantId: new Types.ObjectId(String(tenantId)),
        channel,
        address,
        at: { $gte: since, $lte: now },
      })
      .sort({ at: -1 })
      .exec();
    if (!touch) return null;
    return {
      kind: 'campaign',
      id: String(touch.campaignId),
      name: touch.campaignName,
      at: touch.at,
    };
  }
}
