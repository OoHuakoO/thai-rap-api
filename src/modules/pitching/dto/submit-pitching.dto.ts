import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';
import { PITCHING_MAX_CRITERIA } from '../pitching.const';
import { UpdatePitchingScoreDto } from './update-pitching-score.dto';
import { UpdatePitchingDto } from './update-pitching.dto';

export class SubmitPitchingScoreDto extends UpdatePitchingScoreDto {
  @ApiProperty({ description: 'PitchingCriterion.id — 101–110 or 201–216', example: 101 })
  @IsInt()
  @Min(1)
  criterionId: number;
}

// The judge fills the whole form offline and sends it here in one call, so
// submit carries everything `PATCH /pitching/:id` and `PUT .../scores/:id`
// carry, plus the scores. Every field stays optional: an omitted key keeps
// whatever is stored, which is what makes a resubmit of an unchanged section
// a no-op rather than a wipe.
export class SubmitPitchingDto extends UpdatePitchingDto {
  @ApiPropertyOptional({ type: [SubmitPitchingScoreDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PITCHING_MAX_CRITERIA)
  @ValidateNested({ each: true })
  @Type(() => SubmitPitchingScoreDto)
  scores?: SubmitPitchingScoreDto[];
}
