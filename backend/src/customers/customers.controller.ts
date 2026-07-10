import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, CRM_ROLES, type AuthReq } from '../auth/permissions';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Get()
  findAll(
    @Query('search') search: string,
    @Query('tag') tag: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.customersService.findAll(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      search,
      tag,
    );
  }

  @Post()
  create(@Body() dto: CreateCustomerDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.customersService.create(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Post('sync')
  sync(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.customersService.sync(req.user.tenantId);
  }

  @Get('export.csv')
  async exportCsv(
    @Request() req: AuthReq,
    @Res({ passthrough: true }) res: any,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    const csv = await this.customersService.exportCsv(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    res.setHeader('Content-Disposition', 'attachment; filename="clientes.csv"');
    return new StreamableFile(Buffer.from('﻿' + csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.customersService.update(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.customersService.delete(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }
}
