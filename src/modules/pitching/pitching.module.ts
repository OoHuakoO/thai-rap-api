import { Module } from '@nestjs/common';
import { StoreModule } from '@modules/store/store.module';
import { PitchingController } from './pitching.controller';
import { PitchingRepository } from './pitching.repository';
import { PitchingService } from './pitching.service';

@Module({
  imports: [StoreModule],
  controllers: [PitchingController],
  providers: [PitchingService, PitchingRepository],
  exports: [PitchingService],
})
export class PitchingModule {}
