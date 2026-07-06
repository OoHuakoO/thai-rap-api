import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AssessmentStatus, Round } from '@prisma/client';
import { PaginationDto } from '@common/dto/pagination.dto';

export class QueryAssessmentDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'clx1234567890' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ enum: Round })
  @IsOptional()
  @IsEnum(Round, { message: 'round must be one of T0, T1, T2, T3, T4' })
  round?: Round;

  @ApiPropertyOptional({ enum: AssessmentStatus })
  @IsOptional()
  @IsEnum(AssessmentStatus, { message: 'status must be a valid assessment status' })
  status?: AssessmentStatus;
}
