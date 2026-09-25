import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CalendarConnection,
  CalendarConnectionSchema,
} from './calendar-connection.schema';
import { CalendarService } from './calendar.service';
import { CalendarOAuthService } from './calendar-oauth.service';
import {
  CalendarController,
  CalendarOAuthCallbackController,
} from './calendar.controller';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: CalendarConnection.name, schema: CalendarConnectionSchema },
    ]),
  ],
  controllers: [CalendarOAuthCallbackController, CalendarController],
  providers: [CalendarService, CalendarOAuthService],
  exports: [CalendarService],
})
export class CalendarModule {}
