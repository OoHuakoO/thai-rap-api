import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { BadRequestException } from '@common/exceptions/app.exception';
import {
  ERROR_CODES,
  FILE_MAX_SIZE_BYTES,
  FILE_MAX_SIZE_MB,
  ASSESSMENT_EVIDENCE_MIME_REGEX,
} from '@constants/index';
import { AssessmentService } from './assessment.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateScoreDto } from './dto/update-score.dto';
import { BulkScoreDto } from './dto/bulk-score.dto';
import { QueryAssessmentDto } from './dto/query-assessment.dto';
import { RankQueryDto } from './dto/rank-query.dto';
import { UpdateNotesDto } from './dto/update-notes.dto';

@ApiTags('Assessment')
@ApiBearerAuth()
@Controller('assessments')
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Get()
  @ApiOperation({ summary: 'List assessments (filter by storeId, round, status)' })
  findAll(@Query() query: QueryAssessmentDto) {
    return this.assessmentService.findAll(query);
  }

  @Get('rank')
  @ApiOperation({
    summary: 'Get overall/province rank and dimension averages for a store in a round',
  })
  getRank(@Query() query: RankQueryDto, @CurrentUser() user: JwtPayload) {
    return this.assessmentService.getRank(query.storeId, query.round, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an assessment with all 50 questions and current scores' })
  findOne(@Param('id') id: string) {
    return this.assessmentService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft assessment for (storeId, round)' })
  create(@Body() dto: CreateAssessmentDto, @CurrentUser() user: JwtPayload) {
    return this.assessmentService.create(dto, user);
  }

  @Put(':id/scores/:questionId')
  @ApiOperation({ summary: 'Upsert the score for one question' })
  updateScore(
    @Param('id') id: string,
    @Param('questionId', ParseIntPipe) questionId: number,
    @Body() dto: UpdateScoreDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.assessmentService.updateScore(id, questionId, dto, user);
  }

  @Post(':id/scores/bulk')
  @ApiOperation({ summary: 'Upsert scores for multiple questions at once' })
  bulkUpdateScores(
    @Param('id') id: string,
    @Body() dto: BulkScoreDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.assessmentService.bulkUpdateScores(id, dto, user);
  }

  @Post(':id/scores/:questionId/evidence')
  @ApiOperation({ summary: 'Upload an evidence file for a scored question (stored on local disk)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadEvidence(
    @Param('id') id: string,
    @Param('questionId', ParseIntPipe) questionId: number,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: FILE_MAX_SIZE_BYTES }),
          new FileTypeValidator({ fileType: ASSESSMENT_EVIDENCE_MIME_REGEX }),
        ],
        exceptionFactory: (error: string) =>
          error.toLowerCase().includes('size')
            ? new BadRequestException(
                ERROR_CODES.FILE.TOO_LARGE,
                `ไฟล์มีขนาดเกิน ${FILE_MAX_SIZE_MB} MB`,
              )
            : new BadRequestException(
                ERROR_CODES.FILE.INVALID_TYPE,
                'อนุญาตเฉพาะไฟล์ jpeg, png, webp, pdf หรือ xlsx เท่านั้น',
              ),
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.assessmentService.uploadEvidence(id, questionId, file, user);
  }

  @Delete(':id/evidence/:evidenceId')
  @ApiOperation({ summary: 'Delete an evidence file (removes DB row and local file)' })
  async removeEvidence(
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assessmentService.removeEvidence(id, evidenceId, user);
    return null;
  }

  @Get(':id/scores/progress')
  @ApiOperation({ summary: 'Get how many of the 50 questions are scored' })
  getProgress(@Param('id') id: string) {
    return this.assessmentService.getProgress(id);
  }

  @Patch(':id/notes')
  @ApiOperation({ summary: 'Update the assessor notes on a draft/in-progress assessment' })
  updateNotes(
    @Param('id') id: string,
    @Body() dto: UpdateNotesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.assessmentService.updateNotes(id, dto, user);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit an assessment — computes score, zone, and red flags' })
  submit(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.assessmentService.submit(id, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft assessment' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assessmentService.remove(id, user);
    return null;
  }
}
