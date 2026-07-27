import { Module } from '@nestjs/common';
import { AssessmentModule } from '@modules/assessment/assessment.module';
import { StoreModule } from '@modules/store/store.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [AssessmentModule, StoreModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRepository],
})
export class AnalyticsModule {}
