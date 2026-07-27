import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get(':storeId')
  @ApiOperation({ summary: 'KPIs, radar, trend, highlights and red flags for one store' })
  getStoreAnalytics(
    @Param('storeId') storeId: string,
    @Query() query: QueryAnalyticsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getStoreAnalytics(storeId, query, user);
  }

  @Get(':storeId/radar')
  @ApiOperation({ summary: 'Radar chart comparing two rounds for one store' })
  getRadar(
    @Param('storeId') storeId: string,
    @Query() query: QueryAnalyticsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getRadar(storeId, query, user);
  }

  @Get(':storeId/trend')
  @ApiOperation({ summary: 'Total score trend across every submitted round' })
  getTrend(@Param('storeId') storeId: string, @CurrentUser() user: JwtPayload) {
    return this.analyticsService.getTrend(storeId, user);
  }

  @Get(':storeId/action-plans')
  @ApiOperation({ summary: 'IDP action plans (D7/D30/D90) — always empty, no IDP module yet' })
  getActionPlans(@Param('storeId') storeId: string, @CurrentUser() user: JwtPayload) {
    return this.analyticsService.getActionPlans(storeId, user);
  }

  @Get(':storeId/export')
  @ApiOperation({ summary: 'Download the analytics summary as Excel' })
  @ApiProduces(XLSX_CONTENT_TYPE)
  async exportAnalytics(
    @Param('storeId') storeId: string,
    @Query() query: QueryAnalyticsDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.analyticsService.exportAnalytics(storeId, query, user);
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
