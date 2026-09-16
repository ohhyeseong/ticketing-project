import { ApiProperty } from '@nestjs/swagger';

export class UpdateConcertStatusDto {
  @ApiProperty({ example: 'ON_SALE', enum: ['BEFORE_SALE', 'ON_SALE', 'CLOSED'] })
  status: 'BEFORE_SALE' | 'ON_SALE' | 'CLOSED';
}
