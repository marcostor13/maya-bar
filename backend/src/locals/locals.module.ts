import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Local, LocalSchema } from './local.schema';
import { LocalsService } from './locals.service';
import { LocalsController } from './locals.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Local.name, schema: LocalSchema }]),
  ],
  providers: [LocalsService],
  controllers: [LocalsController],
  exports: [LocalsService],
})
export class LocalsModule {}
