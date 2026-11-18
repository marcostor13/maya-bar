import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiKeyGuard, type ApiKeyReq } from './api-key.guard';
import { ApiMessagesService } from './api-messages.service';
import { ApiSmsService } from './api-sms.service';
import { QuotaExceededException } from './api-access.service';
import { SendApiMessageDto } from './dto/api-access.dto';

/** API pública de envío de mensajes (HU13). Solo con clave de API. */
@Controller('public/v1/messages')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(
    private messages: ApiMessagesService,
    private sms: ApiSmsService,
  ) {}

  @Post()
  @HttpCode(201)
  async send(
    @Body() dto: SendApiMessageDto,
    @Request() req: ApiKeyReq,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    try {
      const sender = req.apiAccess.channel === 'sms' ? this.sms : this.messages;
      const { message, duplicate } = await sender.send(
        req.apiAccess,
        dto,
        idempotencyKey,
      );
      if (duplicate) res.status(200);
      return message;
    } catch (err) {
      if (err instanceof QuotaExceededException)
        res.setHeader('Retry-After', String(err.retryAfter));
      throw err;
    }
  }

  @Get(':id')
  status(@Param('id') id: string, @Request() req: ApiKeyReq) {
    return req.apiAccess.channel === 'sms'
      ? this.sms.status(req.apiAccess, id)
      : this.messages.status(req.apiAccess, id);
  }
}
