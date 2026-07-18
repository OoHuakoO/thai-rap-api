import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNotesDto {
  @ApiPropertyOptional({ example: 'ร้านมีศักยภาพด้านการตลาดสูง แนะนำให้เน้นพัฒนาระบบบัญชี' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
