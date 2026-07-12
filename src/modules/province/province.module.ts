import { Module } from '@nestjs/common';
import { ProvinceController } from './province.controller';
import { ProvinceService } from './province.service';
import { ProvinceRepository } from './province.repository';

@Module({
  controllers: [ProvinceController],
  providers: [ProvinceService, ProvinceRepository],
  exports: [ProvinceService],
})
export class ProvinceModule {}
