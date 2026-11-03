import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Captcha de Cloudflare Turnstile para el registro público. Sin
 * `TURNSTILE_SECRET_KEY` (desarrollo y pruebas) no se exige.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return !!this.config.get<string>('TURNSTILE_SECRET_KEY');
  }

  async assertHuman(token: string | undefined, ip?: string): Promise<void> {
    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY');
    if (!secret) return;
    const fail = new BadRequestException(
      'No pudimos comprobar que no eres un robot. Recarga la página e inténtalo de nuevo.',
    );
    if (!token) throw fail;

    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    let ok = false;
    try {
      const res = await fetch(VERIFY_URL, { method: 'POST', body });
      const data = (await res.json()) as {
        success?: boolean;
        'error-codes'?: string[];
      };
      ok = data.success === true;
      if (!ok)
        this.logger.warn(
          `Turnstile rechazó el registro (${ip ?? 'sin IP'}): ${(data['error-codes'] ?? []).join(',')}`,
        );
    } catch (err) {
      // Si Cloudflare no responde se rechaza: dejar pasar abriría la puerta
      // justo cuando no se puede comprobar nada.
      this.logger.error('Turnstile no respondió', err as Error);
    }
    if (!ok) throw fail;
  }
}
