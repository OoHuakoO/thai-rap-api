import { Module } from '@nestjs/common';
import { AssessmentModule } from '@modules/assessment/assessment.module';
import { PitchingModule } from '@modules/pitching/pitching.module';
import { StoreModule } from '@modules/store/store.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [AssessmentModule, PitchingModule, StoreModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRepository],
})
export class AnalyticsModule {}
