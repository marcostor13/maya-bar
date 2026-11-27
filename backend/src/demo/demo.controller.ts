import {
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { Audit } from '../audit/audit.decorator';
import { DemoService } from './demo.service';

/** Cuenta demo (HU86): solo el superadministrador. */
@Controller('admin/demo')
@UseGuards(JwtAuthGuard)
export class DemoController {
  constructor(private demo: DemoService) {}

  @Post('reset')
  @HttpCode(200)
  // La contraseña va solo en la respuesta: nada del body ni del resultado al registro.
  @Audit({ action: 'demo.reset', resource: 'tenant' })
  reset(@Request() req: AuthReq) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
    return this.demo.reset();
  }
}
