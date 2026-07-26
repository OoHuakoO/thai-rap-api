import { ApiPropertyOptional } from '@nestjs/swagger';
import { NewsType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export const NEWS_DEFAULT_LIMIT = 20;
export const NEWS_MAX_LIMIT = 100;

export class QueryNewsDto {
  @ApiPropertyOptional({ enum: NewsType, description: 'Filter to a single category' })
  @IsOptional()
  @IsEnum(NewsType, { message: 'type must be one of GENERAL, EVENT, ALERT' })
  type?: NewsType;

  @ApiPropertyOptional({ default: NEWS_DEFAULT_LIMIT, maximum: NEWS_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NEWS_MAX_LIMIT)
  limit?: number;
}
