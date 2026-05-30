import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'JWT refresh token obtained from login or prior refresh' })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken must not be empty' })
  refreshToken: string;
}
