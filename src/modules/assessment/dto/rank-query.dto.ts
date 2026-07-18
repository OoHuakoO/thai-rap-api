import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { Round } from '@prisma/client';

export class RankQueryDto {
  @ApiProperty({ example: 'clx1234567890' })
  @IsString()
  storeId: string;

  @ApiProperty({ enum: Round })
  @IsEnum(Round, { message: 'round must be one of T0, T1, T2, T3, T4' })
  round: Round;
}
