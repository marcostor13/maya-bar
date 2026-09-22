import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProspectingController } from './prospecting.controller';
import { ProspectingService } from './prospecting.service';
import { ProspectingResearchService } from './prospecting-research.service';
import { ProspectingWorker } from './prospecting-worker.service';
import { ProspectSearch, ProspectSearchSchema } from './prospect-search.schema';
import { Prospect, ProspectSchema } from './prospect.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { AiModule } from '../ai/ai.module';
import { SettingsModule } from '../settings/settings.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProspectSearch.name, schema: ProspectSearchSchema },
      { name: Prospect.name, schema: ProspectSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
    AiModule,
    SettingsModule,
    LeadsModule,
  ],
  controllers: [ProspectingController],
  providers: [
    ProspectingService,
    ProspectingResearchService,
    ProspectingWorker,
  ],
})
export class ProspectingModule {}
