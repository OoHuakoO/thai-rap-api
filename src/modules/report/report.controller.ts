import { Controller, Get, Param, ParseEnumPipe, Query, Res } from '@nestjs/common';
import { Round } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { PaginationDto } from '@common/dto/pagination.dto';
import {
  DEFAULT_REPORT_FORMAT,
  EXPORT_CONTENT_TYPE,
  ExportReportDto,
} from '@common/dto/export-format.dto';
import { sendFile, setFileHeaders } from '@shared/file-response.util';
import { streamRoundMatrixWorkbook } from './report-excel.util';
import { streamRoundMatrixPdf } from './report-pdf.util';
import { ReportService } from './report.service';

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
  @ApiProduces(EXPORT_CONTENT_TYPE.xlsx, EXPORT_CONTENT_TYPE.pdf)
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
    summary: 'Dimension scores for every accessible store in one round, one page at a time',
  })
  getRoundMatrixReport(
    @Param('round', new ParseEnumPipe(Round)) round: Round,
    @Query() query: PaginationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.reportService.getRoundMatrixReport(round, user, query);
  }

  @Get('rounds/:round/stores/export')
  @ApiOperation({
    summary: 'Download every store of the round as Excel or PDF — not the page the table is on',
  })
  @ApiProduces(EXPORT_CONTENT_TYPE.xlsx, EXPORT_CONTENT_TYPE.pdf)
  async exportRoundMatrixReport(
    @Param('round', new ParseEnumPipe(Round)) round: Round,
    @Query() query: ExportReportDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const format = query.format ?? DEFAULT_REPORT_FORMAT;
    // Opened — access checked, cohort counted — before a single header is set,
    // so a 403 still reaches GlobalExceptionFilter as JSON rather than landing
    // inside a file the client has already started downloading.
    const source = await this.reportService.openRoundMatrixExport(round, user);
    setFileHeaders(res, format, `assessment-report-stores-${round}`);
    await (format === 'pdf'
      ? streamRoundMatrixPdf(source, res)
      : streamRoundMatrixWorkbook(source, res));
  }

  @Get('stores/:storeId/overview')
  @ApiOperation({ summary: 'Assessment report across every round for one store' })
  getOverviewReport(@Param('storeId') storeId: string, @CurrentUser() user: JwtPayload) {
    return this.reportService.getOverviewReport(storeId, user);
  }

  @Get('stores/:storeId/overview/export')
  @ApiOperation({ summary: 'Download the all-rounds report as Excel or PDF' })
  @ApiProduces(EXPORT_CONTENT_TYPE.xlsx, EXPORT_CONTENT_TYPE.pdf)
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
