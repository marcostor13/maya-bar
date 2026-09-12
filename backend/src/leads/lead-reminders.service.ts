import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { LeadActivity } from './lead-activity.schema';
import { Lead } from './lead.schema';
import { User } from '../users/user.schema';
import { PushService } from '../push/push.service';
import { NativePushService } from '../notifications/push.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Avisa de las tareas de seguimiento cuando vencen.
 *
 * No hay una colección de "recordatorios": la tarea de un lead
 * (`LeadActivity` de tipo `task` con `dueAt`) ya ES el recordatorio, y es lo
 * que alimenta el próximo paso del tablero. Aquí solo se vigila su vencimiento.
 *
 * `remindedAt` es lo que impide que un aviso se repita en cada pasada; se
 * limpia al cambiar la fecha, para que el aviso nuevo vuelva a salir.
 */
@Injectable()
export class LeadRemindersService {
  private readonly logger = new Logger(LeadRemindersService.name);

  constructor(
    @InjectModel(LeadActivity.name) private activityModel: Model<LeadActivity>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(User.name) private userModel: Model<User>,
    private push: PushService,
    private nativePush: NativePushService,
    private settings: SettingsService,
    private config: ConfigService,
  ) {}

  /**
   * Cada cinco minutos: suficiente para que un recordatorio llegue a tiempo sin
   * convertir el cron en una consulta constante. El índice
   * `{done, remindedAt, dueAt}` evita recorrer la colección entera.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async enviarPendientes(): Promise<void> {
    const vencidas = await this.activityModel
      .find({
        type: 'task',
        done: false,
        remindedAt: null,
        dueAt: { $ne: null, $lte: new Date() },
      })
      .sort({ dueAt: 1 })
      .limit(100) // tope por pasada: si se acumulan, salen en las siguientes
      .exec();

    if (!vencidas.length) return;

    let enviados = 0;
    for (const tarea of vencidas) {
      try {
        await this.avisar(tarea);
        enviados++;
      } catch (err) {
        this.logger.error(
          `No se pudo avisar de la tarea ${String(tarea._id)}: ${(err as Error).message}`,
        );
      } finally {
        // Se marca pase lo que pase: un fallo de envío no debe provocar que el
        // mismo aviso se reintente cada cinco minutos para siempre.
        tarea.remindedAt = new Date();
        await tarea.save();
      }
    }

    this.logger.log(`Recordatorios enviados: ${enviados}/${vencidas.length}`);
  }

  /** Push por los dos canales y, si la tarea lo pide, WhatsApp al responsable. */
  private async avisar(tarea: LeadActivity): Promise<void> {
    const lead = await this.leadModel.findById(tarea.leadId).exec();
    if (!lead) return; // el lead se borró: el aviso ya no tiene sentido

    const tenantId = String(lead.tenantId);
    const titulo = `Seguimiento: ${lead.title}`;
    const cuerpo = tarea.title;
    const ruta = `/leads?lead=${String(lead._id)}`;

    // El dueño del lead es quien debe recibirlo; si no hay, quien creó la tarea.
    const destinatario = lead.ownerId ?? tarea.createdBy;

    if (destinatario) {
      await Promise.allSettled([
        this.push.sendToUser(String(destinatario), {
          title: titulo,
          body: cuerpo,
          url: ruta,
          tag: `lead-${String(lead._id)}`,
        }),
        this.nativePush.sendToUser(String(destinatario), {
          title: titulo,
          body: cuerpo,
          data: { route: ruta, leadId: String(lead._id) },
        }),
      ]);
    } else {
      // Sin responsable asignado avisa a quien pueda trabajar el seguimiento.
      await Promise.allSettled([
        this.push.sendToTenant(
          tenantId,
          {
            title: titulo,
            body: cuerpo,
            url: ruta,
            tag: `lead-${String(lead._id)}`,
          },
          { moduleKey: 'leads' },
        ),
        this.nativePush.sendToTenantModule(tenantId, 'leads', {
          title: titulo,
          body: cuerpo,
          data: { route: ruta, leadId: String(lead._id) },
        }),
      ]);
    }

    if (tarea.remindByWhatsApp) await this.avisarPorWhatsApp(tarea, lead);
  }

  /**
   * WhatsApp al teléfono del responsable. Es opcional por tarea: no todo
   * seguimiento merece interrumpir a alguien en su móvil.
   */
  private async avisarPorWhatsApp(
    tarea: LeadActivity,
    lead: Lead,
  ): Promise<void> {
    const destinatario = lead.ownerId ?? tarea.createdBy;
    if (!destinatario) return;

    const usuario = await this.userModel
      .findById(new Types.ObjectId(String(destinatario)))
      .select('phone name')
      .lean<{ phone?: string; name?: string }>()
      .exec();

    const telefono = usuario?.phone?.replace(/\D/g, '');
    if (!telefono) {
      this.logger.warn(
        `La tarea ${String(tarea._id)} pide aviso por WhatsApp, pero el responsable no tiene teléfono`,
      );
      return;
    }

    const base = (this.config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    const enlace = base ? `\n${base}/leads?lead=${String(lead._id)}` : '';

    await this.settings.sendWhatsApp(
      telefono,
      `⏰ *Seguimiento pendiente*\n\n${tarea.title}\n_${lead.title}_${enlace}`,
      String(lead.tenantId),
    );
  }
}
