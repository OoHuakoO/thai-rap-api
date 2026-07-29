import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role, UserStatus } from '@prisma/client';
import { PaginationDto } from '@common/dto/pagination.dto';

export class QueryUserDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Matches name or email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
