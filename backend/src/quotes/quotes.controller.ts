import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import {
  assertRole,
  CRM_ROLES,
  MANAGE_ROLES,
  type AuthReq,
} from '../auth/permissions';
import { Audit } from '../audit/audit.decorator';
import { QuotesService } from './quotes.service';
import {
  ImportWooDto,
  ProductDto,
  QuoteDto,
  RejectQuoteDto,
  SendQuoteDto,
} from './dto/quote.dto';

/** Catálogo y cotizaciones de las oportunidades (HU68). */
@Controller()
export class QuotesController {
  constructor(private quotes: QuotesService) {}

  // ── Catálogo ───────────────────────────────────────────────────────────

  @Get('products')
  @UseGuards(JwtAuthGuard, ModuleGuard('leads'))
  listProducts(@Request() req: AuthReq, @Query('all') all?: string) {
    assertRole(req.user.role, CRM_ROLES);
    return this.quotes.listProducts(req.user.tenantId, all === '1');
  }

  @Post('products')
  @UseGuards(JwtAuthGuard, ModuleGuard('leads'))
  createProduct(@Request() req: AuthReq, @Body() dto: ProductDto) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.quotes.createProduct(req.user.tenantId, dto);
  }

  @Post('products/import-woocommerce')
  @UseGuards(JwtAuthGuard, ModuleGuard('leads'))
  importWoo(@Request() req: AuthReq, @Body() dto: ImportWooDto) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.quotes.importWoo(req.user.tenantId, dto.storeUrl);
  }

  @Patch('products/:id')
  @UseGuards(JwtAuthGuard, ModuleGuard('leads'))
  updateProduct(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: ProductDto,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.quotes.updateProduct(req.user.tenantId, id, dto);
  }

  @Delete('products/:id')
  @UseGuards(JwtAuthGuard, ModuleGuard('leads'))
  removeProduct(@Request() req: AuthReq, @Param('id') id: string) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.quotes.removeProduct(req.user.tenantId, id);
  }

  // ── Cotizaciones ───────────────────────────────────────────────────────

  @Get('quotes')
  @UseGuards(JwtAuthGuard, ModuleGuard('leads'))
  list(@Request() req: AuthReq, @Query('leadId') leadId: string) {
    assertRole(req.user.role, CRM_ROLES);
    const u = req.user;
    return this.quotes.listByLead(u.tenantId, u.userId, u.role, leadId);
  }

  @Get('quotes/:id')
  @UseGuards(JwtAuthGuard, ModuleGuard('leads'))
  get(@Request() req: AuthReq, @Param('id') id: string) {
    assertRole(req.user.role, CRM_ROLES);
    const u = req.user;
    return this.quotes.get(u.tenantId, u.userId, u.role, id);
  }

  @Get('quotes/:id/pdf')
  @UseGuards(JwtAuthGuard, ModuleGuard('leads'))
  async pdf(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    const u = req.user;
    const q = await this.quotes.get(u.tenantId, u.userId, u.role, id);
    this.sendPdf(res, q.number, await this.quotes.pdf(q));
  }

  @Post('quotes')
  @UseGuards(JwtAuthGuard, ModuleGuard('leads'))
  create(@Request() req: AuthReq, @Body() dto: QuoteDto) {
    assertRole(req.user.role, CRM_ROLES);
    const u = req.user;
    return this.quotes.create(u.tenantId, u.userId, u.role, dto);
  }

  @Patch('quotes/:id')
  @UseGuards(JwtAuthGuard, ModuleGuard('leads'))
  update(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: QuoteDto,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    const u = req.user;
    return this.quotes.update(u.tenantId, u.userId, u.role, id, dto);
  }

  @Delete('quotes/:id')
  @UseGuards(JwtAuthGuard, ModuleGuard('leads'))
  remove(@Request() req: AuthReq, @Param('id') id: string) {
    assertRole(req.user.role, CRM_ROLES);
    const u = req.user;
    return this.quotes.remove(u.tenantId, u.userId, u.role, id);
  }

  @Audit({ action: 'quote.sent', resource: 'quote', idParam: 'id' })
  @Post('quotes/:id/send')
  @UseGuards(JwtAuthGuard, ModuleGuard('leads'))
  send(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: SendQuoteDto,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    const u = req.user;
    return this.quotes.send(u.tenantId, u.userId, u.role, id, dto);
  }

  // ── Link público ───────────────────────────────────────────────────────

  @Get('public/quotes/:token')
  view(@Param('token') token: string) {
    return this.quotes.publicView(token);
  }

  @Get('public/quotes/:token/pdf')
  async publicPdf(@Param('token') token: string, @Res() res: Response) {
    const q = await this.quotes.findPublic(token);
    this.sendPdf(res, q.number, await this.quotes.pdf(q));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('public/quotes/:token/accept')
  accept(@Param('token') token: string) {
    return this.quotes.accept(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('public/quotes/:token/reject')
  reject(@Param('token') token: string, @Body() dto: RejectQuoteDto) {
    return this.quotes.reject(token, dto.reason);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('public/quotes/:token/pay')
  pay(@Param('token') token: string) {
    return this.quotes.pay(token);
  }

  private sendPdf(res: Response, number: string, pdf: Buffer) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Cotizacion-${number}.pdf"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  }
}
