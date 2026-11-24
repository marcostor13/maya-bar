import {
  ForbiddenException,
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { TurnstileService } from '../auth/turnstile.service';
import { CheckoutService } from './checkout.service';
import { CouponsService } from './coupons/coupons.service';
import { CreateCheckoutDto } from './dto/checkout.dto';

const MINUTE = 60_000;

/** Checkout público de la landing (HU46). */
@Controller('public/checkout')
@UseGuards(ThrottlerGuard)
export class PublicCheckoutController {
  constructor(
    private checkout: CheckoutService,
    private turnstile: TurnstileService,
    private coupons: CouponsService,
  ) {}

  @Get('quote')
  @Throttle({ default: { limit: 60, ttl: MINUTE } })
  quote(
    @Query('plan') plan: string,
    @Query('period') period: string,
    @Query('currency') currency = 'PEN',
    @Query('coupon') coupon?: string,
    @Query('setup') setup?: string,
  ) {
    return this.checkout.quoteWithCoupon(plan, period, currency, coupon, setup);
  }

  /** Cupos fundador que quedan (HU54), para la landing. */
  @Get('founder')
  @Throttle({ default: { limit: 60, ttl: MINUTE } })
  founder() {
    return this.coupons.remaining();
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60 * MINUTE } })
  async create(@Body() dto: CreateCheckoutDto, @Ip() ip: string) {
    await this.turnstile.assertHuman(dto.captchaToken, ip);
    return this.checkout.create(dto);
  }

  @Get(':id')
  @Throttle({ default: { limit: 120, ttl: MINUTE } })
  status(@Param('id') id: string) {
    return this.checkout.status(id);
  }
}

/** Checkout desde la cuenta en prueba: activa el plan en la misma empresa. */
@Controller('billing/checkout')
@UseGuards(JwtAuthGuard)
export class AccountCheckoutController {
  constructor(private checkout: CheckoutService) {}

  /** Cotización con los add-ons de la cuenta (HU53) y cupón (HU54). */
  @Get('quote')
  quote(
    @Request() req: AuthReq,
    @Query('plan') plan: string,
    @Query('period') period: string,
    @Query('currency') currency = 'PEN',
    @Query('coupon') coupon?: string,
    @Query('setup') setup?: string,
  ) {
    if (!req.user.tenantId)
      return this.checkout.quoteWithCoupon(
        plan,
        period,
        currency,
        coupon,
        setup,
      );
    return this.checkout.quoteForAccount(
      String(req.user.tenantId),
      plan,
      period,
      currency,
      coupon,
      setup,
    );
  }

  @Post()
  create(@Body() dto: CreateCheckoutDto, @Request() req: AuthReq) {
    // Solo el administrador de la empresa: ni roles propios ni el superadmin.
    if (req.user.role !== 'TENANT_ADMIN' || !req.user.tenantId)
      throw new ForbiddenException(
        'Solo el administrador de la empresa puede comprar el plan',
      );
    return this.checkout.create(dto, {
      tenantId: String(req.user.tenantId),
      userId: req.user.userId,
    });
  }
}
