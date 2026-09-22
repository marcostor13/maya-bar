import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Reservation, ReservationSchema } from './reservation.schema';
import { Local, LocalSchema } from '../locals/local.schema';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { MailModule } from '../mail/mail.module';
import { ConversionsModule } from '../conversions/conversions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Reservation.name, schema: ReservationSchema },
      { name: Local.name, schema: LocalSchema },
    ]),
    MailModule,
    // Una reserva es una cita: si el cliente vino de un anuncio, se reporta.
    ConversionsModule,
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
