import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { verifyMpSignature } from './mercadopago/mp-signature';
import { BillingEventsService } from './billing-events.service';

interface MpWebhookBody {
  id?: string | number;
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: string | number };
}

/**
 * Notificaciones de Mercado Pago (HU45). Firma obligatoria; el cuerpo solo
 * dice qué recurso volver a consultar, nunca su estado.
 */
@Controller('billing/webhooks')
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  constructor(
    private config: ConfigService,
    private events: BillingEventsService,
  ) {}

  @Post('mercadopago')
  @HttpCode(200)
  async receive(
    @Body() body: MpWebhookBody,
    @Query() query: Record<string, string>,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Req() req: Request,
  ) {
    // El recurso que se procesa es exactamente el que va firmado.
    const signedId =
      query['data.id'] ??
      (body?.data?.id != null ? String(body.data.id) : undefined);
    const dataId = signedId ?? '';
    const type = String(
      body?.type ?? query.type ?? query.topic ?? body?.topic ?? '',
    );
    const valid = verifyMpSignature({
      signature,
      requestId,
      dataId: signedId,
      secret: this.config.get<string>('MP_WEBHOOK_SECRET'),
    });
    if (!valid) {
      this.logger.warn(
        `Webhook de Mercado Pago con firma no válida (tipo ${type || '?'}, recurso ${dataId || '?'}, ip ${req.ip})`,
      );
      throw new UnauthorizedException('Firma no válida');
    }
    if (!dataId || !type) return { ok: true };

    const event = await this.events.enqueue({
      eventId: body?.id != null ? String(body.id) : undefined,
      type,
      action: body?.action,
      dataId,
      raw: { body, query },
    });
    // Se responde ya; el procesamiento corre aparte (y el cron reintenta).
    if (event) setImmediate(() => void this.events.process(event));
    return { ok: true };
  }
}
