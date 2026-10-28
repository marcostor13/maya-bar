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

    let step = 'canje del código';
    try {
      const short = await this.oauth.exchangeCodeForToken(code);
      this.logger.log(
        `IG OAuth: código canjeado (user_id=${short.userId}, token ${short.accessToken.slice(0, 4)}…)`,
      );
      step = 'token de larga duración';
      let long: { accessToken: string; expiresIn: number };
      try {
        long = await this.oauth.exchangeForLongLivedToken(short.accessToken);
      } catch (err) {
        this.logger.warn(`IG OAuth: canje a token largo falló: ${String(err)}`);
        step = 'verificación del token corto (/me)';
        // Algunas cuentas rechazan el canje ("Unsupported request"). Si el token
        // del código funciona contra /me, se conecta con él (vence en ~1 h y se
        // puede renovar desde Ajustes) en vez de abortar la conexión.
        const check = await this.oauth.fetchProfile(short.accessToken);
        if (!check.userId) throw err;
        this.logger.warn(
          `Canje a token largo falló (${String(err)}); se usa el token corto`,
        );
        long = { accessToken: short.accessToken, expiresIn: 3600 };
      }
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
      this.logger.error(
        `Instagram OAuth callback error en ${step}: ${String(err)}`,
      );
      const detail = err instanceof Error ? err.message : '';
      // Meta da un token pero rechaza toda consulta cuando la cuenta es personal:
      // la API con Instagram Login solo admite cuentas profesionales.
      const hint = /unsupported request/i.test(detail)
        ? '. Verifica que la cuenta de Instagram sea profesional (Empresa o Creador) y que hayas aceptado todos los permisos'
        : '';
      return redirect({
        ig_oauth: 'error',
        reason: `No se pudo completar la conexión con Instagram${detail ? `: ${detail}` : ''}${hint}`,
      });
    }
  }
}
