import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  assertRole,
  MANAGE_ROLES,
  OPERATIONAL_ROLES,
  type AuthReq,
} from '../auth/permissions';
import { ReservationsService } from './reservations.service';
import {
  CreateReservationDto,
  UpdateReservationStatusDto,
  ReservationConfigDto,
} from './dto/reservation.dto';
import { ReservationStatus } from './reservation.schema';

@Controller()
export class ReservationsController {
  constructor(private reservationsService: ReservationsService) {}

  // ─── Public routes ────────────────────────────────────────────────────────

  @Get('public/reservations/availability')
  getAvailability(
    @Query('localId') localId: string,
    @Query('date') date: string,
  ) {
    return this.reservationsService.getAvailability(localId, date);
  }

  @Get('public/reservations/config')
  getPublicConfig(@Query('localId') localId: string) {
    return this.reservationsService.getPublicConfig(localId);
  }

  @Post('public/reservations')
  createReservation(@Body() dto: CreateReservationDto) {
    return this.reservationsService.createReservation(dto);
  }

  @Get('public/reservations/:token')
  getByToken(@Param('token') token: string) {
    return this.reservationsService.getByToken(token);
  }

  @Patch('public/reservations/:token/confirm')
  confirmByToken(@Param('token') token: string) {
    return this.reservationsService.confirmByToken(token);
  }

  // ─── Staff routes ─────────────────────────────────────────────────────────

  @Get('reservations')
  @UseGuards(JwtAuthGuard)
  findReservations(
    @Query('localId') localId: string,
    @Query('date') date: string,
    @Query('status') status: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, OPERATIONAL_ROLES);
    return this.reservationsService.findReservations(
      req.user.tenantId,
      localId,
      date,
      status,
    );
  }

  @Patch('reservations/:id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReservationStatusDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.reservationsService.updateStatus(
      id,
      req.user.tenantId,
      dto.status as ReservationStatus,
      dto.note,
    );
  }

  @Get('reservations/config')
  @UseGuards(JwtAuthGuard)
  getConfig(@Query('localId') localId: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.reservationsService.getConfig(localId, req.user.tenantId);
  }

  @Put('reservations/config')
  @UseGuards(JwtAuthGuard)
  updateConfig(@Body() dto: ReservationConfigDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.reservationsService.updateConfig(req.user.tenantId, dto);
  }
}
