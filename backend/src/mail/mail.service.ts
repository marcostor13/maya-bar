import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MailService {
  private resend: Resend | null = null;
  private readonly logger = new Logger(MailService.name);
  private logoBase64: string | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn('RESEND_API_KEY is not defined. Emails will be mocked and logged to the console.');
    }

    // Intentar cargar el logo para adjuntarlo como CID
    try {
      const logoPath = path.join(process.cwd(), '..', 'frontend', 'public', 'logo.png');
      if (fs.existsSync(logoPath)) {
        this.logoBase64 = fs.readFileSync(logoPath).toString('base64');
      }
    } catch (err) {
      this.logger.error('No se pudo cargar el logo para los correos', err);
    }
  }

  private formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr + 'T12:00:00'); // Evitar problemas de timezone
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      };
      const formatted = date.toLocaleDateString('es-ES', options);
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    } catch {
      return dateStr;
    }
  }

  async sendPasswordResetEmail(email: string, code: string) {
    const subject = 'Recuperación de contraseña - MAYA';
    const html = `
      <div style="font-family: 'Inter', Arial, sans-serif; background-color: #f9fafb; padding: 40px 20px;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
          <div style="padding: 40px; text-align: center;">
            <div style="margin-bottom: 24px;">
              <img src="cid:logo" alt="MAYA" style="height: 48px; width: auto;" />
            </div>
            <h2 style="color: #111827; font-size: 22px; font-weight: 700; margin-bottom: 12px;">Recuperar contraseña</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
              Utiliza el siguiente código para restablecer tu acceso. Expira en 15 minutos.
            </p>
            
            <div style="background-color: #fdf2f4; border: 2px dashed #fecdd3; padding: 24px; border-radius: 16px; margin-bottom: 32px;">
              <span style="font-family: monospace; font-size: 42px; font-weight: 800; letter-spacing: 8px; color: #E11D48;">${code}</span>
            </div>
            
            <p style="color: #9ca3af; font-size: 13px;">
              Si no solicitaste este cambio, puedes ignorar este mensaje de seguridad.
            </p>
          </div>
        </div>
      </div>
    `;

    if (this.resend) {
      try {
        await this.resend.emails.send({
          from: 'MAYA <no_reply@mayasend.marcostorresalarcon.com>',
          to: email,
          subject,
          html,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          attachments: this.logoBase64 ? [{ filename: 'logo.png', content: Buffer.from(this.logoBase64, 'base64'), cid: 'logo' } as any] : []
        });
        this.logger.log(`Password reset email sent to ${email}`);
      } catch (error) {
        this.logger.error(`Failed to send email to ${email}`, error);
      }
    } else {
      this.logger.log(`[MOCK EMAIL] To: ${email} | Subject: ${subject}`);
      this.logger.log(`[MOCK EMAIL] Content: Your reset code is ${code}`);
    }
  }

  async sendReservationEmail(data: {
    email: string;
    guestName: string;
    localName: string;
    date: string;
    turno: string;
    partySize: number;
    token: string;
  }) {
    const confirmationUrl = `http://localhost:4200/book/confirm/${data.token}`;
    const friendlyDate = this.formatDate(data.date);
    const subject = `Tu reserva en ${data.localName} - MAYA`;
    
    const html = `
      <div style="font-family: 'Inter', 'Poppins', Arial, sans-serif; background-color: #f3f4f6; padding: 48px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
          <div style="padding: 48px 40px;">
            <!-- Logo area -->
            <div style="text-align: center; margin-bottom: 40px;">
              <img src="cid:logo" alt="MAYA" style="height: 60px; width: auto;" />
            </div>

            <h2 style="color: #111827; font-size: 26px; font-weight: 700; margin-bottom: 16px; text-align: center;">¡Hola, ${data.guestName}!</h2>
            <p style="color: #4b5563; font-size: 18px; line-height: 1.6; text-align: center; margin-bottom: 40px;">
              Hemos recibido tu solicitud para <strong>${data.localName}</strong>. 
              Por favor, confirma los detalles a continuación.
            </p>
            
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 24px; padding: 32px; margin-bottom: 40px;">
              <div style="margin-bottom: 20px; border-bottom: 1px solid #f3f4f6; padding-bottom: 20px;">
                <div style="color: #9ca3af; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Día seleccionado</div>
                <div style="color: #111827; font-size: 20px; font-weight: 700;">${friendlyDate}</div>
              </div>
              
              <div style="display: flex; gap: 20px;">
                <div style="flex: 1;">
                  <div style="color: #9ca3af; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Hora</div>
                  <div style="color: #111827; font-size: 20px; font-weight: 700;">${data.turno}</div>
                </div>
                <div style="flex: 1;">
                  <div style="color: #9ca3af; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Invitados</div>
                  <div style="color: #111827; font-size: 20px; font-weight: 700;">${data.partySize} personas</div>
                </div>
              </div>
            </div>

            <div style="text-align: center;">
              <a href="${confirmationUrl}" style="background-color: #E11D48; color: #ffffff; padding: 20px 48px; border-radius: 9999px; text-decoration: none; font-size: 18px; font-weight: 700; display: inline-block; box-shadow: 0 10px 15px -3px rgba(225, 29, 72, 0.3);">
                Confirmar mi Asistencia
              </a>
              <p style="color: #9ca3af; font-size: 14px; margin-top: 24px;">
                ¿Cambio de planes? Por favor, avísanos con anticipación.
              </p>
            </div>
          </div>
          
          <div style="background-color: #111827; padding: 24px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              © 2026 MAYA Platform. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </div>
    `;

    if (this.resend) {
      try {
        await this.resend.emails.send({
          from: 'MAYA <no_reply@mayasend.marcostorresalarcon.com>',
          to: data.email,
          subject,
          html,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          attachments: this.logoBase64 ? [{ filename: 'logo.png', content: Buffer.from(this.logoBase64, 'base64'), cid: 'logo' } as any] : []
        });
        this.logger.log(`Reservation email sent to ${data.email}`);
      } catch (error) {
        this.logger.error(`Failed to send reservation email to ${data.email}`, error);
      }
    } else {
      this.logger.log(`[MOCK EMAIL] To: ${data.email} | Subject: ${subject}`);
      this.logger.log(`[MOCK EMAIL] Content: Reservation details for ${data.guestName} at ${data.localName}`);
    }
  }

  async sendEventConfirmationEmail(data: {
    email: string;
    name: string;
    eventTitle: string;
    eventDate: string;
    eventTime?: string;
    ticketCode: string;
    partySize: number;
  }) {
    const friendlyDate = this.formatDate(data.eventDate);
    const subject = `Confirmación: ${data.eventTitle} - MAYA`;

    const html = `
      <div style="font-family: 'Inter', 'Poppins', Arial, sans-serif; background-color: #f3f4f6; padding: 48px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
          <div style="padding: 48px 40px;">
            <div style="text-align: center; margin-bottom: 40px;">
              <img src="cid:logo" alt="MAYA" style="height: 60px; width: auto;" />
            </div>

            <h2 style="color: #111827; font-size: 26px; font-weight: 700; margin-bottom: 16px; text-align: center;">¡Tu entrada está lista!</h2>
            <p style="color: #4b5563; font-size: 18px; line-height: 1.6; text-align: center; margin-bottom: 40px;">
              Hola ${data.name}, te has registrado con éxito para <strong>${data.eventTitle}</strong>.
            </p>
            
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 24px; padding: 32px; margin-bottom: 40px; text-align: left;">
              <div style="margin-bottom: 20px; border-bottom: 1px solid #f3f4f6; padding-bottom: 20px;">
                <div style="color: #9ca3af; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Evento y Fecha</div>
                <div style="color: #111827; font-size: 20px; font-weight: 700;">${data.eventTitle}</div>
                <div style="color: #4b5563; font-size: 16px;">${friendlyDate}${data.eventTime ? ' · ' + data.eventTime : ''}</div>
              </div>
              
              <div style="margin-bottom: 20px;">
                <div style="color: #9ca3af; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Tu Código de Acceso</div>
                <div style="background: #E11D48; color: #fff; display: inline-block; padding: 12px 24px; border-radius: 12px; font-family: monospace; font-size: 28px; font-weight: 800; letter-spacing: 4px; margin-top: 8px;">
                  ${data.ticketCode}
                </div>
              </div>

              <div>
                <div style="color: #9ca3af; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Personas</div>
                <div style="color: #111827; font-size: 18px; font-weight: 700;">${data.partySize} ${data.partySize === 1 ? 'persona' : 'personas'}</div>
              </div>
            </div>

            <div style="text-align: center;">
              <p style="color: #4b5563; font-size: 15px; margin-bottom: 24px;">
                Presenta este código al llegar para tu check-in.
              </p>
              <p style="color: #9ca3af; font-size: 13px;">
                Si tienes dudas, contacta directamente con el local.
              </p>
            </div>
          </div>
          
          <div style="background-color: #111827; padding: 24px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              © 2026 MAYA Platform. Gestionado por BAR.
            </p>
          </div>
        </div>
      </div>
    `;

    if (this.resend) {
      try {
        await this.resend.emails.send({
          from: 'MAYA <no_reply@mayasend.marcostorresalarcon.com>',
          to: data.email,
          subject,
          html,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          attachments: this.logoBase64 ? [{ filename: 'logo.png', content: Buffer.from(this.logoBase64, 'base64'), cid: 'logo' } as any] : []
        });
        this.logger.log(`Event confirmation email sent to ${data.email}`);
      } catch (error) {
        this.logger.error(`Failed to send event email to ${data.email}`, error);
      }
    } else {
      this.logger.log(`[MOCK EMAIL] To: ${data.email} | Subject: ${subject}`);
      this.logger.log(`[MOCK EMAIL] Ticket: ${data.ticketCode}`);
    }
  }

  async sendCampaign(params: { to: string; name: string; subject: string; body: string; mediaUrl?: string; mediaType?: 'image' | 'video' }) {
    const mediaHtml = params.mediaUrl
      ? params.mediaType === 'video'
        ? `<div style="text-align:center;margin-bottom:24px;"><video src="${params.mediaUrl}" controls style="max-width:100%;border-radius:16px;"></video></div>`
        : `<div style="text-align:center;margin-bottom:24px;"><img src="${params.mediaUrl}" alt="" style="max-width:100%;border-radius:16px;" /></div>`
      : '';
    const html = `
      <div style="font-family: 'Inter', Arial, sans-serif; background-color: #f9fafb; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
          <div style="padding: 40px;">
            ${this.logoBase64 ? '<div style="text-align:center;margin-bottom:32px;"><img src="cid:logo" alt="MAYA" style="height:48px;width:auto;" /></div>' : ''}
            ${mediaHtml}
            <div style="font-size: 16px; color: #374151; line-height: 1.7; white-space: pre-wrap;">${params.body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          </div>
          <div style="background-color: #111827; padding: 20px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2026 MAYA Platform</p>
          </div>
        </div>
      </div>
    `;

    if (this.resend) {
      await this.resend.emails.send({
        from: 'MAYA <no_reply@mayasend.marcostorresalarcon.com>',
        to: params.to,
        subject: params.subject,
        html,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attachments: this.logoBase64 ? [{ filename: 'logo.png', content: Buffer.from(this.logoBase64, 'base64'), cid: 'logo' } as any] : [],
      });
    } else {
      this.logger.log(`[MOCK CAMPAIGN] To: ${params.to} | Subject: ${params.subject}`);
    }
  }
}
