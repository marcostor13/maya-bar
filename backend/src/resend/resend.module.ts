import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ResendConfig, ResendConfigSchema } from './resend-config.schema';
import { ResendController, ResendStatusController } from './resend.controller';
import { ResendService } from './resend.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ResendConfig.name, schema: ResendConfigSchema },
    ]),
  ],
  controllers: [ResendController, ResendStatusController],
  providers: [ResendService],
  exports: [ResendService],
})
export class ResendModule {}
