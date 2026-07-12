import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { StoreStatus } from '@prisma/client';
import { CreateStoreDto } from './create-store.dto';

export class UpdateStoreDto extends PartialType(OmitType(CreateStoreDto, ['ownerId'] as const)) {}

export class UpdateStoreStatusDto {
  @ApiProperty({ enum: StoreStatus, example: StoreStatus.T0_COMPLETED })
  @IsEnum(StoreStatus, { message: 'status must be a valid store status' })
  status: StoreStatus;
}

export class RemovePhotoDto {
  @ApiProperty({ example: '/uploads/stores/abc123/photos/xyz.jpg' })
  @IsString()
  @MinLength(1)
  url: string;
}
