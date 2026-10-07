import { Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import { CampaignSenderService } from './campaign-sender.service';

function page(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh;background:#f8fafc;color:#0f172a;"><main style="max-width:420px;margin:24px;padding:32px;background:#ffffff;border-radius:24px;box-shadow:0 10px 30px rgba(15,23,42,.08);text-align:center;"><h1 style="font-size:22px;margin:0 0 12px;">${title}</h1>${body}</main></body></html>`;
}

const BUTTON =
  'border:0;border-radius:9999px;background:#0f172a;color:#ffffff;font-size:16px;font-weight:600;padding:14px 28px;cursor:pointer;';

/**
 * Baja pública desde el link de un correo o SMS: `{API}/u/:token`. Sin
 * guards: el token firmado es la autorización.
 *
 * El GET solo muestra un botón. La baja ocurre en el POST: los filtros
 * antispam abren todos los enlaces de un correo, y con un GET que diera de
 * baja acabarían dando de baja a gente que no lo pidió.
 */
@Controller('u')
export class UnsubscribeController {
  constructor(private sender: CampaignSenderService) {}

  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  confirm(@Param('token') token: string): string {
    if (!this.sender.verifyUnsubscribeToken(token))
      return page(
        'Enlace no válido',
        '<p style="margin:0;color:#64748b;">Este enlace de baja no es correcto o está incompleto.</p>',
      );
    return page(
      '¿Dejar de recibir mensajes?',
      `<p style="margin:0 0 24px;color:#64748b;">No volveremos a enviarte comunicaciones.</p><form method="post"><button type="submit" style="${BUTTON}">Darme de baja</button></form>`,
    );
  }

  /** También lo llaman los clientes de correo (`List-Unsubscribe-Post`). */
  @Post(':token')
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async unsubscribe(@Param('token') token: string): Promise<string> {
    const done = await this.sender.unsubscribe(token);
    return done
      ? page(
          'Listo',
          '<p style="margin:0;color:#64748b;">Te hemos dado de baja. No recibirás más mensajes.</p>',
        )
      : page(
          'Enlace no válido',
          '<p style="margin:0;color:#64748b;">No pudimos procesar la baja con este enlace.</p>',
        );
  }
}
