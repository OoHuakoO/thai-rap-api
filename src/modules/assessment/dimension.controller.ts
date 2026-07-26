import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DimensionService } from './dimension.service';
import { QueryQuestionDto } from './dto/query-question.dto';

@ApiTags('Assessment')
@ApiBearerAuth()
@Controller()
export class DimensionController {
  constructor(private readonly dimensionService: DimensionService) {}

  @Get('dimensions')
  @ApiOperation({ summary: 'List the 8 assessment dimensions' })
  findAllDimensions() {
    return this.dimensionService.findAllDimensions();
  }

  @Get('dimensions/:id/questions')
  @ApiOperation({ summary: 'List questions for a dimension' })
  findQuestionsByDimension(@Param('id', ParseIntPipe) id: number) {
    return this.dimensionService.findQuestionsByDimension(id);
  }

  @Get('questions')
  @ApiOperation({ summary: 'List all 50 questions, optionally filtered by dimension' })
  findAllQuestions(@Query() query: QueryQuestionDto) {
    return this.dimensionService.findAllQuestions(query.dimensionId);
  }
}
