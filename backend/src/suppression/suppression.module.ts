import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SuppressionController } from './suppression.controller';
import { SuppressionService } from './suppression.service';
import {
  SuppressionEntry,
  SuppressionEntrySchema,
} from './suppression-entry.schema';

/**
 * Global: campañas y bandeja de entrada tienen que poder preguntar por la
 * lista antes de cada envío, y encadenar el import por ahí sería ruido.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SuppressionEntry.name, schema: SuppressionEntrySchema },
    ]),
  ],
  controllers: [SuppressionController],
  providers: [SuppressionService],
  exports: [SuppressionService],
})
export class SuppressionModule {}
