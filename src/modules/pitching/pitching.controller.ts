import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import {
  DEFAULT_REPORT_FORMAT,
  EXPORT_CONTENT_TYPE,
  ExportReportDto,
} from '@common/dto/export-format.dto';
import { sendFile } from '@shared/file-response.util';
import { CreatePitchingDto } from './dto/create-pitching.dto';
import {
  QueryPitchingCriteriaDto,
  QueryPitchingStoreReportDto,
  QueryPitchingSummaryDto,
} from './dto/query-pitching-round.dto';
import { QueryPitchingDto } from './dto/query-pitching.dto';
import { UpdatePitchingScoreDto } from './dto/update-pitching-score.dto';
import { UpdatePitchingDto } from './dto/update-pitching.dto';
import { PitchingService } from './pitching.service';

@ApiTags('Pitching')
@ApiBearerAuth()
@Controller('pitching')
export class PitchingController {
  constructor(private readonly pitchingService: PitchingService) {}

  // Declared before ':id' — Nest matches in declaration order, so a literal
  // segment placed after the param route would never be reached.
  @Get('criteria')
  @ApiOperation({ summary: 'List the scoring criteria of one or both pitching forms' })
  findCriteria(@Query() query: QueryPitchingCriteriaDto, @CurrentUser() user: JwtPayload) {
    return this.pitchingService.findCriteria(query, user);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Ranking for a round — one row per store, ordered by judge average' })
  getSummary(@Query() query: QueryPitchingSummaryDto, @CurrentUser() user: JwtPayload) {
    return this.pitchingService.getSummary(query, user);
  }

  @Get('summary/export')
  @ApiOperation({
    summary: 'Download the whole round’s ranking as Excel or PDF — not the page the table is on',
  })
  @ApiProduces(EXPORT_CONTENT_TYPE.xlsx, EXPORT_CONTENT_TYPE.pdf)
  async exportRanking(
    @Query() query: QueryPitchingSummaryDto,
    @Query() exportQuery: ExportReportDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const format = exportQuery.format ?? DEFAULT_REPORT_FORMAT;
    const file = await this.pitchingService.exportRanking(query, format, user);
    sendFile(res, file, format, `pitching-ranking-${query.round}`);
  }

  @Get('stores/:storeId')
  @ApiOperation({ summary: 'One store’s pitching report for a round (every judge, averaged)' })
  getStoreReport(
    @Param('storeId') storeId: string,
    @Query() query: QueryPitchingStoreReportDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pitchingService.getStoreReport(storeId, query, user);
  }

  @Get('stores/:storeId/export')
  @ApiOperation({ summary: 'Download one store’s pitching report as Excel or PDF' })
  @ApiProduces(EXPORT_CONTENT_TYPE.xlsx, EXPORT_CONTENT_TYPE.pdf)
  async exportStoreReport(
    @Param('storeId') storeId: string,
    @Query() query: QueryPitchingStoreReportDto,
    @Query() exportQuery: ExportReportDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const format = exportQuery.format ?? DEFAULT_REPORT_FORMAT;
    const file = await this.pitchingService.exportStoreReport(storeId, query, format, user);
    sendFile(res, file, format, `pitching-report-${query.round}`);
  }

  @Get()
  @ApiOperation({ summary: 'List pitching forms (filter by storeId, round, judgeId, status)' })
  findAll(@Query() query: QueryPitchingDto, @CurrentUser() user: JwtPayload) {
    return this.pitchingService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one pitching form with every criterion and its score' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.pitchingService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Start a draft pitching form for (storeId, round) as the caller' })
  create(@Body() dto: CreatePitchingDto, @CurrentUser() user: JwtPayload) {
    return this.pitchingService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Save the header, minimum conditions, comments and verdict' })
  update(@Param('id') id: string, @Body() dto: UpdatePitchingDto, @CurrentUser() user: JwtPayload) {
    return this.pitchingService.update(id, dto, user);
  }

  @Put(':id/scores/:criterionId')
  @ApiOperation({ summary: 'Upsert the score and note for one criterion' })
  updateScore(
    @Param('id') id: string,
    @Param('criterionId', ParseIntPipe) criterionId: number,
    @Body() dto: UpdatePitchingScoreDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pitchingService.updateScore(id, criterionId, dto, user);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit the form — freezes its total. Store.status is not touched.' })
  submit(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.pitchingService.submit(id, user);
  }
}
