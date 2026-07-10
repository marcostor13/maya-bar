import { Global, Module } from '@nestjs/common';
import { MetaGraphClient } from './meta-graph.client';

/** Infraestructura transversal (clientes HTTP externos). Global: no hace falta importarlo por módulo. */
@Global()
@Module({
  providers: [MetaGraphClient],
  exports: [MetaGraphClient],
})
export class SharedModule {}
