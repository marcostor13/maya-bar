import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TenantsModule } from './tenants/tenants.module';
import { LocalsModule } from './locals/locals.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { ReservationsModule } from './reservations/reservations.module';
import { MailModule } from './mail/mail.module';
import { EventsModule } from './events/events.module';
import { UploadModule } from './upload/upload.module';
import { CustomersModule } from './customers/customers.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { SettingsModule } from './settings/settings.module';
import { ListsModule } from './lists/lists.module';
import { VisitsModule } from './visits/visits.module';
import { ImpulsadorModule } from './impulsador/impulsador.module';
import { WhatsAppAccountsModule } from './whatsapp-accounts/whatsapp-accounts.module';
import { AiAgentsModule } from './ai-agents/ai-agents.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    TenantsModule,
    LocalsModule,
    MenuModule,
    OrdersModule,
    ReservationsModule,
    MailModule,
    EventsModule,
    UploadModule,
    CustomersModule,
    CampaignsModule,
    WhatsAppModule,
    SettingsModule,
    ListsModule,
    VisitsModule,
    ImpulsadorModule,
    WhatsAppAccountsModule,
    AiAgentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
