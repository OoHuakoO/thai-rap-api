import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'ร้านส้มตำป้าแดง' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'ชลบุรี' })
  @IsString()
  @MaxLength(100)
  province: string;

  @ApiProperty({ example: 'อาหารตามสั่ง' })
  @IsString()
  @MaxLength(100)
  storeType: string;

  @ApiProperty({ example: 'สมศรี ใจดี' })
  @IsString()
  @MaxLength(200)
  ownerName: string;

  @ApiProperty({ example: '0812345678' })
  @IsString()
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ example: 'somsri@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;

  @ApiProperty({ example: '123 หมู่ 4 ต.บางพระ อ.ศรีราชา จ.ชลบุรี' })
  @IsString()
  address: string;

  @ApiPropertyOptional({ example: { facebook: 'https://facebook.com/somrestaurant' } })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;

  @ApiPropertyOptional({ example: 15000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  avgRevenue?: number;

  @ApiPropertyOptional({ example: 'ยอดขายไม่แน่นอน ต้นทุนสูง' })
  @IsOptional()
  @IsString()
  mainProblems?: string;

  @ApiPropertyOptional({ example: 'เพิ่มยอดขาย 20% ใน 6 เดือน' })
  @IsOptional()
  @IsString()
  goals?: string;
}
