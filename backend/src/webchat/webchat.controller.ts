import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request as ExpressReq, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, MANAGE_ROLES, type AuthReq } from '../auth/permissions';
import { Audit } from '../audit/audit.decorator';
import { WebchatService } from './webchat.service';
import { WIDGET_JS } from './widget-script';
import {
  UpdateWidgetDto,
  WebContactDto,
  WebMessageDto,
  WebSessionDto,
} from './dto/webchat.dto';

/** Chat web de la empresa (HU69). */
@Controller()
export class WebchatController {
  constructor(
    private webchat: WebchatService,
    private config: ConfigService,
  ) {}

  private view(w: Awaited<ReturnType<WebchatService['getOrCreate']>>) {
    const api = (this.config.get<string>('PUBLIC_API_URL') || '').replace(
      /\/$/,
      '',
    );
    return {
      _id: String(w._id),
      key: w.key,
      active: w.active,
      title: w.title,
      greeting: w.greeting,
      color: w.color,
      askContact: w.askContact,
      whatsappNumber: w.whatsappNumber ?? '',
      allowedDomains: w.allowedDomains,
      agentId: w.agentId ? String(w.agentId) : null,
      snippet: `<script src="${api}/public/webchat/widget.js" data-key="${w.key}" async></script>`,
    };
  }

  // ── Configuración ──────────────────────────────────────────────────────

  @Get('webchat/widget')
  @UseGuards(JwtAuthGuard)
  async get(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.view(await this.webchat.getOrCreate(req.user.tenantId));
  }

  @Audit({ action: 'webchat.updated', resource: 'webchat' })
  @Put('webchat/widget')
  @UseGuards(JwtAuthGuard)
  async update(@Request() req: AuthReq, @Body() dto: UpdateWidgetDto) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.view(await this.webchat.update(req.user.tenantId, dto));
  }

  // ── Público (lo llama el widget desde el sitio de la empresa) ──────────

  @Get('public/webchat/widget.js')
  script(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(WIDGET_JS);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('public/webchat/:key/session')
  async session(
    @Param('key') key: string,
    @Headers('origin') origin: string,
    @Headers('referer') referer: string,
    @Body() dto: WebSessionDto,
  ) {
    const w = await this.webchat.resolve(key, { origin, referer });
    return this.webchat.session(w, dto.visitorId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('public/webchat/:key/messages')
  async message(
    @Param('key') key: string,
    @Headers('origin') origin: string,
    @Headers('referer') referer: string,
    @Body() dto: WebMessageDto,
  ) {
    const w = await this.webchat.resolve(key, { origin, referer });
    return this.webchat.send(w, dto.token, dto.text, dto.website);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('public/webchat/:key/contact')
  async contact(
    @Param('key') key: string,
    @Headers('origin') origin: string,
    @Headers('referer') referer: string,
    @Body() dto: WebContactDto,
  ) {
    const w = await this.webchat.resolve(key, { origin, referer });
    return this.webchat.identify(w, dto.token, dto);
  }

  @Get('public/webchat/:key/messages')
  async history(
    @Param('key') key: string,
    @Headers('origin') origin: string,
    @Headers('referer') referer: string,
    @Query('token') token: string,
    @Query('since') since?: string,
  ) {
    const w = await this.webchat.resolve(key, { origin, referer });
    return this.webchat.history(w, token, since);
  }

  /** Respuestas del equipo o del agente en tiempo real (Server-Sent Events). */
  @Get('public/webchat/:key/stream')
  async stream(
    @Param('key') key: string,
    @Query('token') token: string,
    @Req() req: ExpressReq,
    @Res() res: Response,
  ) {
    const w = await this.webchat.resolve(key, {
      origin: req.headers.origin,
      referer: req.headers.referer,
    });
    const visitorId = this.webchat.visitor(w, token);
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    const off = this.webchat.subscribe(w, visitorId, (e) =>
      res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`),
    );
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    ping.unref();
    req.on('close', () => {
      clearInterval(ping);
      off();
    });
  }
}
