import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { MessengerAccountsService } from './messenger-accounts.service';
import { MessengerOAuthService } from '../messenger/messenger-oauth.service';
import { MessengerService } from '../messenger/messenger.service';

/**
 * Callback PÚBLICO (sin JWT) al que Meta redirige el navegador tras la autorización.
 * La identidad del tenant viaja en `state` (firmado por MessengerOAuthService.signState),
 * no en un header — el navegador llega aquí por una navegación normal, no un XHR autenticado.
 */
@Controller('messenger-accounts/oauth')
export class MessengerOAuthCallbackController {
  private readonly logger = new Logger(MessengerOAuthCallbackController.name);

  constructor(
    private accounts: MessengerAccountsService,
    private oauth: MessengerOAuthService,
    private ms: MessengerService,
    private config: ConfigService,
  ) {}

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    const frontend = (this.config.get<string>('FRONTEND_URL') || '').replace(
      /\/$/,
      '',
    );
    const redirect = (params: Record<string, string>) =>
      res.redirect(
        `${frontend}/settings?${new URLSearchParams(params).toString()}`,
      );

    if (errorDescription)
      return redirect({ ms_oauth: 'error', reason: errorDescription });
    if (!code || !state)
      return redirect({
        ms_oauth: 'error',
        reason: 'Faltan parámetros de Meta',
      });

    const decoded = this.oauth.verifyState(state);
    if (!decoded)
      return redirect({
        ms_oauth: 'error',
        reason: 'Estado inválido o expirado, intenta de nuevo',
      });

    try {
      const short = await this.oauth.exchangeCodeForToken(code);
      const long = await this.oauth.exchangeForLongLivedToken(
        short.accessToken,
      );
      const pages = await this.oauth.listPages(long.accessToken);
      if (pages.length === 0)
        return redirect({
          ms_oauth: 'error',
          reason: 'No autorizaste ninguna página de Facebook',
        });

      const accounts = await this.accounts.upsertFromOAuth(
        decoded.tenantId,
        pages,
        long.expiresIn
          ? new Date(Date.now() + long.expiresIn * 1000)
          : undefined,
      );

      for (const account of accounts) {
        const sub = await this.ms.subscribeWebhook(
          this.accounts.toConfig(account),
        );
        if (!sub.success)
          this.logger.warn(
            `No se pudo suscribir webhook para la página ${account.pageId}: ${sub.message}`,
          );
      }
      return redirect({
        ms_oauth: 'success',
        connected: String(accounts.length),
      });
    } catch (err) {
      this.logger.error(`Messenger OAuth callback error: ${String(err)}`);
      return redirect({
        ms_oauth: 'error',
        reason: 'No se pudo completar la conexión con Messenger',
      });
    }
  }
}
