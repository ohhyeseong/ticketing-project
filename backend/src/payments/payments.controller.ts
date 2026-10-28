import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post()
  create(@Body() dto: CreatePaymentDto, @Req() req) {
    return this.paymentsService.create(dto, req.user.userId);
  }

  @Get(':reservationId')
  findByReservation(@Param('reservationId') reservationId: string) {
    return this.paymentsService.findByReservation(Number(reservationId));
  }
}
