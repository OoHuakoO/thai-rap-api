import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PitchingRound } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '@common/dto/pagination.dto';

export class QueryPitchingCriteriaDto {
  @ApiPropertyOptional({ enum: PitchingRound, description: 'Omit to get both forms' })
  @IsOptional()
  @IsEnum(PitchingRound, { message: 'round must be one of PITCH_DECK, ACCELERATION' })
  round?: PitchingRound;
}

// The ranking is one round's cohort — a mixed-round leaderboard would average
// two different forms together, so `round` is required here.
export class QueryPitchingSummaryDto extends PaginationDto {
  @ApiProperty({ enum: PitchingRound })
  @IsEnum(PitchingRound, { message: 'round must be one of PITCH_DECK, ACCELERATION' })
  round: PitchingRound;

  // Filters the rows, never the ranking: `rank` stays each store's position in
  // the whole round. Renumbering 1..n inside a province would print "อันดับ 1"
  // next to a store that is not the programme's first, and the paper form ranks
  // one cohort.
  @ApiPropertyOptional({ description: 'Show only stores in this province' })
  @IsOptional()
  @IsString()
  province?: string;
}

export class QueryPitchingStoreReportDto {
  @ApiProperty({ enum: PitchingRound })
  @IsEnum(PitchingRound, { message: 'round must be one of PITCH_DECK, ACCELERATION' })
  round: PitchingRound;
}
