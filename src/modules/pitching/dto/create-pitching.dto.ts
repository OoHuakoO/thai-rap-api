import { ApiProperty } from '@nestjs/swagger';
import { PitchingRound } from '@prisma/client';
import { IsEnum, IsString, MinLength } from 'class-validator';

export class CreatePitchingDto {
  @ApiProperty({ example: 'clx1store0001' })
  @IsString()
  @MinLength(1, { message: 'กรุณาระบุร้านที่ต้องการประเมิน' })
  storeId: string;

  @ApiProperty({ enum: PitchingRound, example: PitchingRound.PITCH_DECK })
  @IsEnum(PitchingRound, { message: 'round must be one of PITCH_DECK, ACCELERATION' })
  round: PitchingRound;
}
