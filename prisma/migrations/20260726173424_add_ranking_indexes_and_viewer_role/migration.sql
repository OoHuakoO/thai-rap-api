-- AlterTable
ALTER TABLE `User` MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'ASSESSOR', 'MENTOR', 'ENTREPRENEUR', 'JUDGE', 'ME_TEAM', 'VIEWER') NOT NULL;

-- CreateIndex
CREATE INDEX `Assessment_round_status_idx` ON `Assessment`(`round`, `status`);

-- CreateIndex
CREATE INDEX `Store_province_status_idx` ON `Store`(`province`, `status`);
