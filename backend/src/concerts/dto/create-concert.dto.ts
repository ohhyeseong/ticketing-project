import { ApiProperty } from '@nestjs/swagger';

export class CreateConcertDto {
  @ApiProperty({ example: '가을 콘서트' })
  title: string;

  @ApiProperty({ example: '올림픽공원' })
  venue: string;

  @ApiProperty({ example: '2026-11-01T19:00:00' })
  performanceDate: string;
}
