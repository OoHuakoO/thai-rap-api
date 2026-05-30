import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsEnum,
  IsNotIn,
  IsOptional,
  IsArray,
} from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'นางสาวศิริวรรณ จันทร์ดี' })
  @IsString()
  @MinLength(2, { message: 'name must be at least 2 characters' })
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'siriwan.j@rbru.ac.th' })
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

  @ApiPropertyOptional({ example: '081-234-5678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'มหาวิทยาลัยราชภัฏราไพพรรณี' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  department?: string;

  @ApiPropertyOptional({ type: [String], example: ['จันทบุรี', 'ตราด'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  provinces?: string[];
}
