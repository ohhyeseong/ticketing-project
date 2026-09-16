import { ApiProperty } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty({ example: 'test@test.com' })
  email: string;

  @ApiProperty({ example: '1234' })
  password: string;
}
