import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DimensionService } from './dimension.service';

@ApiTags('Assessment')
@ApiBearerAuth()
@Controller()
export class DimensionController {
  constructor(private readonly dimensionService: DimensionService) {}

  @Get('dimensions')
  @ApiOperation({ summary: 'List the 8 assessment dimensions' })
  findAllDimensions() {
    return this.dimensionService.findAllDimensions();
  }
}
