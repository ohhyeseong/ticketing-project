import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private reservationsService: ReservationsService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateReservationDto) {
    return this.reservationsService.create(req.user.userId, dto);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.reservationsService.confirm(Number(id));
  }

  @Get('my')
  findMy(@Req() req) {
    return this.reservationsService.findMyReservations(req.user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.reservationsService.findAll();
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.reservationsService.cancel(Number(id));
  }
}
