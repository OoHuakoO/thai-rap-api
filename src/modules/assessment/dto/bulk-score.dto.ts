import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, ValidateNested } from 'class-validator';
import { UpdateScoreDto } from './update-score.dto';

class BulkScoreItemDto extends UpdateScoreDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  questionId: number;
}

export class BulkScoreDto {
  @ApiProperty({ type: [BulkScoreItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkScoreItemDto)
  scores: BulkScoreItemDto[];
}

export { BulkScoreItemDto };
