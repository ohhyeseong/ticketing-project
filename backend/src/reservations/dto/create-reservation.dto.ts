import { ApiProperty } from '@nestjs/swagger';

export class CreateReservationDto {
  @ApiProperty({ example: 1 })
  concertId: number;

  @ApiProperty({ example: 1 })
  seatId: number;
}
