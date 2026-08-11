import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '@common/dto/pagination.dto';

export const ACTIVITY_SEARCH_MAX_LENGTH = 200;

export class QueryActivityDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'ค้นหาจากชื่อกิจกรรมหรือสถานที่' })
  @IsOptional()
  @IsString()
  @MaxLength(ACTIVITY_SEARCH_MAX_LENGTH)
  search?: string;
}
