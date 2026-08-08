import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const PITCHING_SCORE_NOTE_MAX_LENGTH = 1000;

export class UpdatePitchingScoreDto {
  // No @Max here: the upper bound is the criterion's own maxScore (2–15
  // depending on the row), so it can only be checked once the criterion is
  // loaded — PitchingService.updateScore does it.
  @ApiPropertyOptional({ description: 'คะแนนที่ได้ — null clears it', minimum: 0, example: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  score?: number | null;

  @ApiPropertyOptional({
    description: 'หลักฐาน/ข้อสังเกต',
    maxLength: PITCHING_SCORE_NOTE_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(PITCHING_SCORE_NOTE_MAX_LENGTH)
  note?: string;
}
