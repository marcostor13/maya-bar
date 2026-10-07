import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SmsConfig, SmsConfigSchema } from './sms-config.schema';
import { SmsController, SmsStatusController } from './sms.controller';
import { SmsService } from './sms.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SmsConfig.name, schema: SmsConfigSchema },
    ]),
  ],
  controllers: [SmsController, SmsStatusController],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
