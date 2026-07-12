import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto, UpdateStoreStatusDto } from './dto/update-store.dto';
import { QueryStoreDto } from './dto/query-store.dto';

@ApiTags('Stores')
@ApiBearerAuth()
@Controller('stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get()
  @ApiOperation({
    summary: 'List stores (paginated, filterable; ENTREPRENEUR only sees their own)',
  })
  findAll(@Query() query: QueryStoreDto, @CurrentUser() user: JwtPayload) {
    return this.storeService.findAll(query, user);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get aggregate store stats for the dashboard' })
  getStats() {
    return this.storeService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a store by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.storeService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a store (ADMIN, or ENTREPRENEUR for their own store)' })
  create(@Body() dto: CreateStoreDto, @CurrentUser() user: JwtPayload) {
    return this.storeService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a store (ADMIN, or ENTREPRENEUR for their own store)' })
  update(@Param('id') id: string, @Body() dto: UpdateStoreDto, @CurrentUser() user: JwtPayload) {
    return this.storeService.update(id, dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: "Update a store's status (ADMIN only)" })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStoreStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeService.updateStatus(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a store (ADMIN only)' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.storeService.remove(id, user);
    return null;
  }
}
