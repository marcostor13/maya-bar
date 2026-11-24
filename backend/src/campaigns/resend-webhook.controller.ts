import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { ResendService } from '../resend/resend.service';
import { verifySvixSignature } from '../shared/svix-signature';
import {
  EmailTrackingService,
  type ResendEvent,
} from './email-tracking.service';

/**
 * Webhook PÚBLICO de Resend (HU61), uno por empresa porque cada una usa su
 * propia cuenta. Sin secreto guardado o con firma inválida se responde 401:
 * Resend lo muestra como fallido y el dueño ve que falta configurarlo.
 */
@Controller('resend/webhook')
export class ResendWebhookController {
  private readonly logger = new Logger(ResendWebhookController.name);

  constructor(
    private resend: ResendService,
    private tracking: EmailTrackingService,
  ) {}

  @Post(':tenantId')
  @HttpCode(200)
  async receive(
    @Param('tenantId') tenantId: string,
    @Body() body: ResendEvent,
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') id?: string,
    @Headers('svix-timestamp') timestamp?: string,
    @Headers('svix-signature') signature?: string,
  ) {
    const secret = await this.resend.webhookSecret(tenantId);
    if (
      !secret ||
      !verifySvixSignature(secret, { id, timestamp, signature }, req.rawBody)
    ) {
      this.logger.warn(
        `[Resend] Webhook de ${tenantId} sin firma válida — descartado.`,
      );
      throw new UnauthorizedException('Firma no válida');
    }
    await this.resend.touchWebhook(tenantId);
    const result = await this.tracking.handle(tenantId, id!, body ?? {});
    return { received: true, result };
  }
}
