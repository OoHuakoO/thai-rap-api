import { Module } from '@nestjs/common';
import { AssessmentModule } from '@modules/assessment/assessment.module';
import { StoreModule } from '@modules/store/store.module';
import { ReportController } from './report.controller';
import { ReportRepository } from './report.repository';
import { ReportService } from './report.service';

@Module({
  imports: [AssessmentModule, StoreModule],
  controllers: [ReportController],
  providers: [ReportService, ReportRepository],
})
export class ReportModule {}
