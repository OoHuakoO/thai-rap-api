import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateScoreDto {
  @ApiProperty({ example: 3, minimum: 0, maximum: 4 })
  @IsInt()
  @Min(0)
  @Max(4)
  rawScore: number;

  @ApiPropertyOptional({ example: 'มีสูตรมาตรฐานแต่ยังไม่บันทึกเป็นลายลักษณ์อักษร' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ example: 'แนะนำให้จดสูตรมาตรฐานเป็นเอกสาร' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  suggestion?: string;
}
