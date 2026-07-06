import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { StoreStatus } from '@prisma/client';
import { CreateStoreDto } from './create-store.dto';

export class UpdateStoreDto extends PartialType(CreateStoreDto) {}

export class UpdateStoreStatusDto {
  @ApiProperty({ enum: StoreStatus, example: StoreStatus.T0_COMPLETED })
  @IsEnum(StoreStatus, { message: 'status must be a valid store status' })
  status: StoreStatus;
}
