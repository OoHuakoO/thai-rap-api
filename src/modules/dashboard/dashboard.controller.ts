import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { QueryProvinceComparisonDto } from './dto/query-province-comparison.dto';
import { QueryTop20Dto } from './dto/query-top20.dto';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_FILENAME = 'store-round-scores.xlsx';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'Get project-level KPI cards (staff roles only)' })
  getKpis(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getKpis(user);
  }

  @Get('province-distribution')
  @ApiOperation({ summary: 'Get store count distribution by province (donut chart)' })
  getProvinceDistribution(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getProvinceDistribution(user);
  }

  @Get('top20')
  @ApiOperation({ summary: 'Get top 20 stores by score, optionally filtered by round' })
  getTop20(@Query() query: QueryTop20Dto, @CurrentUser() user: JwtPayload) {
    return this.dashboardService.getTop20(query, user);
  }

  @Get('incubation-progress')
  @ApiOperation({ summary: 'Get incubation funnel step progress' })
  getIncubationProgress(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getIncubationProgress(user);
  }

  @Get('province-comparison')
  @ApiOperation({ summary: 'Compare average scores of two rounds by province (grouped bar chart)' })
  getProvinceComparison(
    @Query() query: QueryProvinceComparisonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.dashboardService.getProvinceComparison(query, user);
  }

  @Get('store-scores')
  @ApiOperation({ summary: 'Get every store with its score for each assessment round' })
  getStoreRoundScores(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getStoreRoundScores(user);
  }

  @Get('store-scores/export')
  @ApiOperation({ summary: 'Download every store round score as an Excel workbook' })
  @ApiProduces(XLSX_CONTENT_TYPE)
  async exportStoreRoundScores(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const workbook = await this.dashboardService.exportStoreRoundScores(user);

    // @Res() opts this route out of TransformInterceptor's { success, data }
    // envelope — the client needs the raw binary, not JSON.
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${XLSX_FILENAME}"`);
    res.send(workbook);
  }

  @Get('activities')
  @ApiOperation({ summary: 'Get recent activities and urgent follow-ups' })
  getActivities(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getActivities(user);
  }

  @Get('reports-status')
  @ApiOperation({ summary: 'Get recent reports and their export status' })
  getReportsStatus(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getReportsStatus(user);
  }
}
