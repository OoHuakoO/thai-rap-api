import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength, IsEnum, IsNotIn } from 'class-validator';
import { Role } from '@prisma/client';

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
    enum: Object.values(Role).filter((r) => r !== Role.ADMIN),
    example: Role.ENTREPRENEUR,
  })
  @IsEnum(Role, { message: 'role must be a valid role' })
  @IsNotIn([Role.ADMIN], { message: 'Cannot self-register as admin' })
  role: Role;
}
