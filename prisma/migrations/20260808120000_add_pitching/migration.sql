-- CreateTable
CREATE TABLE `PitchingCriterion` (
    `id` INTEGER NOT NULL,
    `round` ENUM('PITCH_DECK', 'ACCELERATION') NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `section` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `guideline` TEXT NOT NULL,
    `maxScore` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL,

    INDEX `PitchingCriterion_round_sortOrder_idx`(`round`, `sortOrder`),
    UNIQUE INDEX `PitchingCriterion_round_code_key`(`round`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pitching` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `round` ENUM('PITCH_DECK', 'ACCELERATION') NOT NULL,
    `judgeId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED') NOT NULL DEFAULT 'DRAFT',
    `totalScore` DOUBLE NULL,
    `prototypeProduct` VARCHAR(191) NULL,
    `scoreCardTotal` INTEGER NULL,
    `participationPct` DOUBLE NULL,
    `evidenceChecked` JSON NOT NULL,
    `comments` JSON NOT NULL,
    `recommendation` ENUM('SELECTED', 'WAITING_LIST', 'MINIMUM_NOT_MET', 'NOT_SELECTED') NULL,
    `recommendationReason` TEXT NULL,
    `noConflictOfInterest` BOOLEAN NOT NULL DEFAULT false,
    `evaluatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `submittedAt` DATETIME(3) NULL,

    INDEX `Pitching_round_status_idx`(`round`, `status`),
    UNIQUE INDEX `Pitching_storeId_round_judgeId_key`(`storeId`, `round`, `judgeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PitchingScore` (
    `id` VARCHAR(191) NOT NULL,
    `pitchingId` VARCHAR(191) NOT NULL,
    `criterionId` INTEGER NOT NULL,
    `score` INTEGER NULL,
    `note` TEXT NULL,

    UNIQUE INDEX `PitchingScore_pitchingId_criterionId_key`(`pitchingId`, `criterionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Pitching` ADD CONSTRAINT `Pitching_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pitching` ADD CONSTRAINT `Pitching_judgeId_fkey` FOREIGN KEY (`judgeId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PitchingScore` ADD CONSTRAINT `PitchingScore_pitchingId_fkey` FOREIGN KEY (`pitchingId`) REFERENCES `Pitching`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PitchingScore` ADD CONSTRAINT `PitchingScore_criterionId_fkey` FOREIGN KEY (`criterionId`) REFERENCES `PitchingCriterion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
