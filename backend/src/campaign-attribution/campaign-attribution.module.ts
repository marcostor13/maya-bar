import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignAttributionService } from './campaign-attribution.service';
import { CampaignTouch, CampaignTouchSchema } from './campaign-touch.schema';

/** Atribución de conversaciones a campañas. Sin dependencias de otros módulos. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CampaignTouch.name, schema: CampaignTouchSchema },
    ]),
  ],
  providers: [CampaignAttributionService],
  exports: [CampaignAttributionService],
})
export class CampaignAttributionModule {}
