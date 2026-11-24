import { Controller, Get, Header } from '@nestjs/common';
import { publicCatalog, type PublicCatalog } from './plans.catalog';

/** Catálogo de planes para la landing y el checkout, sin sesión (HU40). */
@Controller('public/plans')
export class PublicPlansController {
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  list(): PublicCatalog {
    return publicCatalog();
  }
}
