import { Controller, Delete, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SeatsService } from './seats.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('seats')
@Controller()
export class SeatsController {
  constructor(private seatsService: SeatsService) {}

  @Get('concerts/:id/seats')
  findByConcert(@Param('id', ParseIntPipe) id: number) { // 여기서 pipe를 이용해 문자열로 오는 parse paramiter를 숫자형으로 자동 변경해줌
    return this.seatsService.findByConcert(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('seats/:id/hold')
  hold(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.seatsService.hold(id, req.user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('seats/:id/hold')
  cancelHold(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.seatsService.cancelHold(id, req.user.userId);
  }
}
