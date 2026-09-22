import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadRemindersService } from './lead-reminders.service';
import { Lead, LeadSchema } from './lead.schema';
import { LeadActivity, LeadActivitySchema } from './lead-activity.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { User, UserSchema } from '../users/user.schema';
import { SettingsModule } from '../settings/settings.module';
import { ConversionsModule } from '../conversions/conversions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: LeadActivity.name, schema: LeadActivitySchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: User.name, schema: UserSchema },
    ]),
    // Los recordatorios avisan por WhatsApp con la cuenta del tenant.
    // `SettingsService` no es global, así que hay que traer su módulo.
    SettingsModule,
    // Calificar o ganar una oportunidad es una conversión que hay que reportar.
    ConversionsModule,
  ],
  controllers: [LeadsController],
  providers: [LeadsService, LeadRemindersService],
  // La bandeja de entrada crea contactos y oportunidades desde el chat.
  exports: [LeadsService],
})
export class LeadsModule {}
