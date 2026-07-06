import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StoreStatus } from '@prisma/client';
import { PaginationDto } from '@common/dto/pagination.dto';

export class QueryStoreDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search by store name or owner name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'ชลบุรี' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ example: 'อาหารตามสั่ง' })
  @IsOptional()
  @IsString()
  storeType?: string;

  @ApiPropertyOptional({ enum: StoreStatus })
  @IsOptional()
  @IsEnum(StoreStatus, { message: 'status must be a valid store status' })
  status?: StoreStatus;
}
