import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ example: 1 })
  reservationId: number;

  @ApiProperty({ example: 50000 })
  amount: number;
}
