import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { EXPORT_CONTENT_TYPE } from '@common/dto/export-format.dto';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';

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
  @ApiOperation({ summary: 'Radar chart — one series per submitted round for one store' })
  getRadar(@Param('storeId') storeId: string, @CurrentUser() user: JwtPayload) {
    return this.analyticsService.getRadar(storeId, user);
  }

  @Get(':storeId/trend')
  @ApiOperation({ summary: 'Total score trend across every submitted round' })
  getTrend(@Param('storeId') storeId: string, @CurrentUser() user: JwtPayload) {
    return this.analyticsService.getTrend(storeId, user);
  }

  @Get(':storeId/export')
  @ApiOperation({ summary: 'Download the analytics summary as Excel' })
  @ApiProduces(EXPORT_CONTENT_TYPE.xlsx)
  async exportAnalytics(
    @Param('storeId') storeId: string,
    @Query() query: QueryAnalyticsDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.analyticsService.exportAnalytics(storeId, query, user);
    res.setHeader('Content-Type', EXPORT_CONTENT_TYPE.xlsx);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
