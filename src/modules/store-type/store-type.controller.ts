import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreTypeService } from './store-type.service';

@ApiTags('Store Types')
@ApiBearerAuth()
@Controller('store-types')
export class StoreTypeController {
  constructor(private readonly storeTypeService: StoreTypeService) {}

  @Get()
  @ApiOperation({ summary: 'List the ประเภทร้าน options a store may be filed under' })
  findAll() {
    return this.storeTypeService.findAll();
  }
}
