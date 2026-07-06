import { Module } from '@nestjs/common';
import { StoreModule } from '@modules/store/store.module';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { AssessmentRepository } from './assessment.repository';
import { DimensionController } from './dimension.controller';
import { DimensionRepository } from './dimension.repository';

@Module({
  imports: [StoreModule],
  controllers: [AssessmentController, DimensionController],
  providers: [AssessmentService, AssessmentRepository, DimensionRepository],
  exports: [AssessmentService],
})
export class AssessmentModule {}
