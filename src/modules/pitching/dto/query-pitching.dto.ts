import { ApiPropertyOptional } from '@nestjs/swagger';
import { PitchingRound, PitchingStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '@common/dto/pagination.dto';

export class QueryPitchingDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'clx1store0001' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ enum: PitchingRound })
  @IsOptional()
  @IsEnum(PitchingRound, { message: 'round must be one of PITCH_DECK, ACCELERATION' })
  round?: PitchingRound;

  @ApiPropertyOptional({ description: 'Restrict to one judge’s forms' })
  @IsOptional()
  @IsString()
  judgeId?: string;

  @ApiPropertyOptional({ enum: PitchingStatus })
  @IsOptional()
  @IsEnum(PitchingStatus, { message: 'status must be one of DRAFT, SUBMITTED' })
  status?: PitchingStatus;
}
