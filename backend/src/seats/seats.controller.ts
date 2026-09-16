import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SeatsService } from './seats.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('seats')
@Controller()
export class SeatsController {
  constructor(private seatsService: SeatsService) {}

  @Get('concerts/:id/seats')
  findByConcert(@Param('id') id: string) {
    return this.seatsService.findByConcert(Number(id));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('seats/:id/hold')
  hold(@Param('id') id: string, @Req() req) {
    return this.seatsService.hold(Number(id), req.user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('seats/:id/hold')
  cancelHold(@Param('id') id: string, @Req() req) {
    return this.seatsService.cancelHold(Number(id), req.user.userId);
  }
}
