import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { AssessmentService } from './assessment.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateScoreDto } from './dto/update-score.dto';
import { BulkScoreDto } from './dto/bulk-score.dto';
import { QueryAssessmentDto } from './dto/query-assessment.dto';

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

  @Get(':id/scores/progress')
  @ApiOperation({ summary: 'Get how many of the 50 questions are scored' })
  getProgress(@Param('id') id: string) {
    return this.assessmentService.getProgress(id);
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
