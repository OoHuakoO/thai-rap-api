import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches } from 'class-validator';
import { PASSWORD_RESET_OTP_LENGTH } from '../auth.const';

export class VerifyOtpDto {
  @ApiProperty({ example: 'siriwan.j@rbru.ac.th' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  @ApiProperty({ example: '482915', minLength: PASSWORD_RESET_OTP_LENGTH })
  @IsString()
  @Matches(new RegExp(`^\\d{${PASSWORD_RESET_OTP_LENGTH}}$`), {
    message: `otp must be ${PASSWORD_RESET_OTP_LENGTH} digits`,
  })
  otp: string;
}
