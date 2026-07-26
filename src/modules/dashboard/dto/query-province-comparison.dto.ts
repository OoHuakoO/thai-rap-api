import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Round } from '@prisma/client';

export const PROVINCE_COMPARISON_DEFAULT_FROM = Round.T0;
export const PROVINCE_COMPARISON_DEFAULT_TO = Round.T1;

export class QueryProvinceComparisonDto {
  @ApiPropertyOptional({
    enum: Round,
    default: PROVINCE_COMPARISON_DEFAULT_FROM,
    description: 'Baseline round of the comparison.',
  })
  @IsOptional()
  @IsEnum(Round, { message: 'from must be one of T0, T1, T2, T3' })
  from?: Round;

  @ApiPropertyOptional({
    enum: Round,
    default: PROVINCE_COMPARISON_DEFAULT_TO,
    description: 'Round compared against the baseline.',
  })
  @IsOptional()
  @IsEnum(Round, { message: 'to must be one of T0, T1, T2, T3' })
  to?: Round;
}
