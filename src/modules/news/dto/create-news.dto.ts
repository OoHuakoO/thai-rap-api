import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NewsType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const NEWS_TITLE_MAX_LENGTH = 200;
export const NEWS_DESCRIPTION_MAX_LENGTH = 2000;

export class CreateNewsDto {
  @ApiProperty({ enum: NewsType, example: NewsType.GENERAL })
  @IsEnum(NewsType, { message: 'type must be one of GENERAL, EVENT, ALERT' })
  type: NewsType;

  @ApiProperty({ example: 'อัปเดตเกณฑ์การประเมินโครงการ ปี 2569' })
  @IsString()
  @MinLength(1, { message: 'กรุณากรอกหัวข้อข่าว' })
  @MaxLength(NEWS_TITLE_MAX_LENGTH)
  title: string;

  @ApiProperty({ example: 'มีผลตั้งแต่วันที่ 18 พ.ค. 2569 เป็นต้นไป' })
  @IsString()
  @MinLength(1, { message: 'กรุณากรอกรายละเอียด' })
  @MaxLength(NEWS_DESCRIPTION_MAX_LENGTH)
  description: string;

  @ApiPropertyOptional({ default: false, description: 'Pins the item as urgent in the feed' })
  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  @ApiPropertyOptional({ description: 'Defaults to now when omitted' })
  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}
