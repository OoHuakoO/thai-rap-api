import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const ACTIVITY_TITLE_MAX_LENGTH = 200;
export const ACTIVITY_DESCRIPTION_MAX_LENGTH = 5000;
export const ACTIVITY_NOTE_MAX_LENGTH = 2000;
export const ACTIVITY_LOCATION_MAX_LENGTH = 200;

export class CreateActivityDto {
  @ApiProperty({ example: 'ค่ายอบรมผู้ประกอบการ รุ่นที่ 1' })
  @IsString()
  @MinLength(1, { message: 'กรุณากรอกชื่อกิจกรรม' })
  @MaxLength(ACTIVITY_TITLE_MAX_LENGTH)
  title: string;

  @ApiProperty({ example: 'อบรมเข้มข้น 3 วัน ด้านการเงินและการตลาดสำหรับร้านอาหาร' })
  @IsString()
  @MinLength(1, { message: 'กรุณากรอกรายละเอียดกิจกรรม' })
  @MaxLength(ACTIVITY_DESCRIPTION_MAX_LENGTH)
  description: string;

  @ApiProperty({ example: '2026-06-14T00:00:00.000Z', description: 'วันที่จัดกิจกรรม' })
  @IsDateString()
  activityDate: string;

  @ApiPropertyOptional({ example: 'โรงแรมเซ็นทรา ศูนย์ราชการ กรุงเทพฯ' })
  @IsOptional()
  @IsString()
  @MaxLength(ACTIVITY_LOCATION_MAX_LENGTH)
  location?: string;

  @ApiPropertyOptional({ example: 'ผู้เข้าร่วม 48 ร้าน จาก 12 จังหวัด' })
  @IsOptional()
  @IsString()
  @MaxLength(ACTIVITY_NOTE_MAX_LENGTH)
  note?: string;
}
