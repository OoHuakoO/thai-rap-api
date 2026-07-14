import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProvinceService } from './province.service';

@ApiTags('Provinces')
@ApiBearerAuth()
@Controller('provinces')
export class ProvinceController {
  constructor(private readonly provinceService: ProvinceService) {}

  @Get()
  @ApiOperation({ summary: 'List the 7 Eastern-region provinces THAI-RAP covers' })
  findAll() {
    return this.provinceService.findAll();
  }
}
