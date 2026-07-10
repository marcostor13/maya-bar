import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { InstagramAccountsService } from './instagram-accounts.service';
import { InstagramOAuthService } from '../instagram/instagram-oauth.service';
import { InstagramService } from '../instagram/instagram.service';

/**
 * Callback PÚBLICO (sin JWT) al que Meta redirige el navegador tras la autorización.
 * La identidad del tenant viaja en `state` (firmado por InstagramOAuthService.signState),
 * no en un header — el navegador llega aquí por una navegación normal, no un XHR autenticado.
 */
@Controller('instagram-accounts/oauth')
export class InstagramOAuthCallbackController {
  private readonly logger = new Logger(InstagramOAuthCallbackController.name);

  constructor(
    private accounts: InstagramAccountsService,
    private oauth: InstagramOAuthService,
    private ig: InstagramService,
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
      return redirect({ ig_oauth: 'error', reason: errorDescription });
    if (!code || !state)
      return redirect({
        ig_oauth: 'error',
        reason: 'Faltan parámetros de Meta',
      });

    const decoded = this.oauth.verifyState(state);
    if (!decoded)
      return redirect({
        ig_oauth: 'error',
        reason: 'Estado inválido o expirado, intenta de nuevo',
      });

    try {
      const short = await this.oauth.exchangeCodeForToken(code);
      const long = await this.oauth.exchangeForLongLivedToken(
        short.accessToken,
      );
      const profile = await this.oauth.fetchProfile(long.accessToken);
      const account = await this.accounts.upsertFromOAuth(decoded.tenantId, {
        userId: profile.userId || short.userId,
        username: profile.username,
        accessToken: long.accessToken,
        expiresIn: long.expiresIn,
      });
      const sub = await this.ig.subscribeWebhook(
        this.accounts.toConfig(account),
      );
      if (!sub.success)
        this.logger.warn(
          `No se pudo suscribir webhook para cuenta IG ${short.userId}: ${sub.message}`,
        );
      return redirect({ ig_oauth: 'success' });
    } catch (err) {
      this.logger.error(`Instagram OAuth callback error: ${String(err)}`);
      return redirect({
        ig_oauth: 'error',
        reason: 'No se pudo completar la conexión con Instagram',
      });
    }
  }
}
