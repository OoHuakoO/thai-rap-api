import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

// Matches the web's ComparePair (`${Round}vs${Round}`) — Round is T0-T3
// (assessment-scoring.util.ts / prisma Round enum), so this is the coarse
// shape check; class-validator can't express "both halves are a real Round".
const COMPARE_PATTERN = /^T[0-3]vsT[0-3]$/;

export class QueryAnalyticsDto {
  @ApiProperty({ example: 'T0vsT1', description: 'Which two rounds to compare' })
  @Matches(COMPARE_PATTERN, { message: 'compare ต้องอยู่ในรูปแบบ TXvsTY เช่น T0vsT1' })
  compare: string;

  @ApiProperty({ required: false, description: 'Province to rank the store against' })
  @IsOptional()
  @IsString()
  province?: string;
}
