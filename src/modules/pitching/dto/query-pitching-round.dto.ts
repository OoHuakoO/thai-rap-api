import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { PitchingRound } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ExportReportDto } from '@common/dto/export-format.dto';
import { PaginationDto } from '@common/dto/pagination.dto';

// The ranking is one round's cohort — a mixed-round leaderboard would average
// two different forms together, so `round` is required here.
export class QueryPitchingSummaryDto extends PaginationDto {
  @ApiProperty({ enum: PitchingRound })
  @IsEnum(PitchingRound, { message: 'round must be one of PITCH_DECK, ACCELERATION' })
  round: PitchingRound;

  // Filters the rows, never the ranking: `rank` stays each store's position in
  // the whole round. Renumbering 1..n inside a province would print "อันดับ 1"
  // next to a store that is not the programme's first, and the paper form ranks
  // one cohort. The caller's own store scope filters the same way, after the
  // ranking rather than before it — see PitchingService.buildRanking.
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

// The global pipe runs `whitelist` + `forbidNonWhitelisted`, and Nest hands the
// *whole* query object to every `@Query()` DTO on the route — so two DTOs on one
// export route reject each other's properties and the download 400s before the
// handler runs. An export route therefore takes exactly one merged class.
export class ExportPitchingSummaryDto extends IntersectionType(
  QueryPitchingSummaryDto,
  ExportReportDto,
) {}

export class ExportPitchingStoreReportDto extends IntersectionType(
  QueryPitchingStoreReportDto,
  ExportReportDto,
) {}
