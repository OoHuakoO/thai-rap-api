import { Module } from '@nestjs/common';
import { ProvinceModule } from '@modules/province/province.module';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { StoreRepository } from './store.repository';

@Module({
  imports: [ProvinceModule],
  controllers: [StoreController],
  providers: [StoreService, StoreRepository],
  exports: [StoreService],
})
export class StoreModule {}
