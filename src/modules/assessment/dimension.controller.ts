import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DimensionRepository } from './dimension.repository';

@ApiTags('Assessment')
@ApiBearerAuth()
@Controller()
export class DimensionController {
  constructor(private readonly dimensionRepo: DimensionRepository) {}

  @Get('dimensions')
  @ApiOperation({ summary: 'List the 8 assessment dimensions' })
  findAllDimensions() {
    return this.dimensionRepo.findAllDimensions();
  }

  @Get('dimensions/:id/questions')
  @ApiOperation({ summary: 'List questions for a dimension' })
  findQuestionsByDimension(@Param('id', ParseIntPipe) id: number) {
    return this.dimensionRepo.findQuestionsByDimension(id);
  }

  @Get('questions')
  @ApiOperation({ summary: 'List all 50 questions, optionally filtered by dimension' })
  findAllQuestions(@Query('dimensionId') dimensionId?: string) {
    return this.dimensionRepo.findAllQuestions(dimensionId ? Number(dimensionId) : undefined);
  }
}
