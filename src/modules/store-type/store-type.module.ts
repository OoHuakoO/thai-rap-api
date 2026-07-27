import { Module } from '@nestjs/common';
import { StoreTypeController } from './store-type.controller';
import { StoreTypeService } from './store-type.service';
import { StoreTypeRepository } from './store-type.repository';

@Module({
  controllers: [StoreTypeController],
  providers: [StoreTypeService, StoreTypeRepository],
  exports: [StoreTypeService],
})
export class StoreTypeModule {}
