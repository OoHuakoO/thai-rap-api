import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, ValidateNested } from 'class-validator';
import { UpdateScoreDto } from './update-score.dto';

// A coarse request cap, not the question count — every item becomes one upsert
// inside a single transaction, so an unbounded array holds row locks on Score
// for as long as it takes to write them. The service still rejects anything
// longer than the real question list; this is what stops the request before it
// reaches the database at all.
export const MAX_BULK_SCORE_ITEMS = 200;

class BulkScoreItemDto extends UpdateScoreDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  questionId: number;
}

export class BulkScoreDto {
  @ApiProperty({ type: [BulkScoreItemDto], maxItems: MAX_BULK_SCORE_ITEMS })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_SCORE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BulkScoreItemDto)
  scores: BulkScoreItemDto[];
}

export { BulkScoreItemDto };
