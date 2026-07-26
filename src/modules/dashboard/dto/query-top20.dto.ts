import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Round } from '@prisma/client';

export const TOP20_ALL_ROUNDS = 'all';

export type Top20RoundFilter = Round | typeof TOP20_ALL_ROUNDS;

export class QueryTop20Dto {
  @ApiPropertyOptional({
    enum: [TOP20_ALL_ROUNDS, ...Object.values(Round)],
    default: TOP20_ALL_ROUNDS,
    description: "Round to rank by. 'all' ranks by each store's latest submitted assessment.",
  })
  @IsOptional()
  @IsEnum(
    { all: TOP20_ALL_ROUNDS, ...Round },
    { message: 'round must be one of all, T0, T1, T2, T3' },
  )
  round?: Top20RoundFilter;
}
