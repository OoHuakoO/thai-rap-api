-- CreateIndex
CREATE UNIQUE INDEX `Score_assessmentId_questionId_key` ON `Score`(`assessmentId`, `questionId`);
