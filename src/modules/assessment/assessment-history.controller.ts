import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { AssessmentService } from './assessment.service';

@ApiTags('Assessment')
@ApiBearerAuth()
@Controller()
export class AssessmentHistoryController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Get('assessment/:storeId/history')
  @ApiOperation({ summary: 'Get all assessment rounds history for a store' })
  getHistory(@Param('storeId') storeId: string, @CurrentUser() user: JwtPayload) {
    return this.assessmentService.getHistory(storeId, user);
  }
}
