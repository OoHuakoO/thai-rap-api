import { Controller, Get, Param, ParseEnumPipe, Query, Res } from '@nestjs/common';
import { Round } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { DEFAULT_REPORT_FORMAT, ExportReportDto, type ReportFormat } from './dto/report-format.dto';
import { ReportService } from './report.service';

const CONTENT_TYPE: Record<ReportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('stores/:storeId/rounds/:round')
  @ApiOperation({
    summary: 'Assessment report for one round (own store for ENTREPRENEUR, any for staff)',
  })
  getRoundReport(
    @Param('storeId') storeId: string,
    @Param('round', new ParseEnumPipe(Round)) round: Round,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.reportService.getRoundReport(storeId, round, user);
  }

  @Get('stores/:storeId/rounds/:round/export')
  @ApiOperation({ summary: 'Download the single-round report as Excel or PDF' })
  @ApiProduces(CONTENT_TYPE.xlsx, CONTENT_TYPE.pdf)
  async exportRoundReport(
    @Param('storeId') storeId: string,
    @Param('round', new ParseEnumPipe(Round)) round: Round,
    @Query() query: ExportReportDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const format = query.format ?? DEFAULT_REPORT_FORMAT;
    const file = await this.reportService.exportRoundReport(storeId, round, format, user);
    sendFile(res, file, format, `assessment-report-${round}`);
  }

  @Get('rounds/:round/stores')
  @ApiOperation({
    summary: 'Dimension scores for every accessible store in one round',
  })
  getRoundMatrixReport(
    @Param('round', new ParseEnumPipe(Round)) round: Round,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.reportService.getRoundMatrixReport(round, user);
  }

  @Get('rounds/:round/stores/export')
  @ApiOperation({ summary: 'Download the all-stores dimension matrix as Excel or PDF' })
  @ApiProduces(CONTENT_TYPE.xlsx, CONTENT_TYPE.pdf)
  async exportRoundMatrixReport(
    @Param('round', new ParseEnumPipe(Round)) round: Round,
    @Query() query: ExportReportDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const format = query.format ?? DEFAULT_REPORT_FORMAT;
    const file = await this.reportService.exportRoundMatrixReport(round, format, user);
    sendFile(res, file, format, `assessment-report-stores-${round}`);
  }

  @Get('stores/:storeId/overview')
  @ApiOperation({ summary: 'Assessment report across every round for one store' })
  getOverviewReport(@Param('storeId') storeId: string, @CurrentUser() user: JwtPayload) {
    return this.reportService.getOverviewReport(storeId, user);
  }

  @Get('stores/:storeId/overview/export')
  @ApiOperation({ summary: 'Download the all-rounds report as Excel or PDF' })
  @ApiProduces(CONTENT_TYPE.xlsx, CONTENT_TYPE.pdf)
  async exportOverviewReport(
    @Param('storeId') storeId: string,
    @Query() query: ExportReportDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const format = query.format ?? DEFAULT_REPORT_FORMAT;
    const file = await this.reportService.exportOverviewReport(storeId, format, user);
    sendFile(res, file, format, 'assessment-report-overview');
  }
}

// @Res() opts these routes out of TransformInterceptor's { success, data }
// envelope — the client needs the raw binary, not JSON.
function sendFile(res: Response, file: Buffer, format: ReportFormat, basename: string): void {
  res.setHeader('Content-Type', CONTENT_TYPE[format]);
  res.setHeader('Content-Disposition', `attachment; filename="${basename}.${format}"`);
  res.send(file);
}
