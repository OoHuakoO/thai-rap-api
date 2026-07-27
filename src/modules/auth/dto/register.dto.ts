import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength, IsIn } from 'class-validator';
import { Role } from '@prisma/client';
import { SELF_REGISTERABLE_ROLES } from '@constants/index';

export class RegisterDto {
  @ApiProperty({ example: 'นางสาวศิริวรรณ จันทร์ดี' })
  @IsString()
  @MinLength(2, { message: 'name must be at least 2 characters' })
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'siriwan.j@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  @ApiProperty({ example: 'P@ssw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(128)
  password: string;

  @ApiProperty({
    enum: SELF_REGISTERABLE_ROLES,
    example: Role.ENTREPRENEUR,
  })
  @IsIn(SELF_REGISTERABLE_ROLES, {
    message: 'role must be one of: ' + SELF_REGISTERABLE_ROLES.join(', '),
  })
  role: Role;
}
