import { Module } from '@nestjs/common';
import { NewsModule } from '@modules/news/news.module';
import { ReportModule } from '@modules/report/report.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';

@Module({
  imports: [NewsModule, ReportModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
})
export class DashboardModule {}
