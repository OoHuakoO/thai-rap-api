import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'siriwan.j@rbru.ac.th' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;
}
