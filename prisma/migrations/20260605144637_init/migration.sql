-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `role` ENUM('ADMIN', 'ASSESSOR', 'MENTOR', 'ENTREPRENEUR', 'JUDGE', 'ME_TEAM') NOT NULL,
    `department` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'PENDING', 'SUSPENDED') NOT NULL DEFAULT 'PENDING',
    `avatar` VARCHAR(191) NULL,
    `lastLogin` DATETIME(3) NULL,
    `permissions` JSON NOT NULL,
    `provinces` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Store` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `province` VARCHAR(191) NOT NULL,
    `storeType` VARCHAR(191) NOT NULL,
    `ownerName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `address` TEXT NOT NULL,
    `socialLinks` JSON NOT NULL,
    `avgRevenue` DOUBLE NULL,
    `mainProblems` TEXT NULL,
    `goals` TEXT NULL,
    `photos` JSON NOT NULL,
    `status` ENUM('REGISTERED', 'T0_COMPLETED', 'CAMP_COMPLETED', 'T1_COMPLETED', 'PITCHING_COMPLETED', 'SELECTED', 'CONDITIONAL_SELECTED', 'WAITING_LIST', 'NOT_SELECTED', 'FIELD_AUDITED', 'IDP_CREATED', 'COMPLETED') NOT NULL DEFAULT 'REGISTERED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Dimension` (
    `id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `weight` INTEGER NOT NULL,
    `questionCount` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Question` (
    `id` INTEGER NOT NULL,
    `dimensionId` INTEGER NOT NULL,
    `questionNo` INTEGER NOT NULL,
    `questionText` TEXT NOT NULL,
    `maxScore` INTEGER NOT NULL DEFAULT 4,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Assessment` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `round` ENUM('T0', 'T1', 'T2', 'T3', 'T4') NOT NULL,
    `assessorId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED') NOT NULL DEFAULT 'DRAFT',
    `totalScore` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `submittedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Assessment_storeId_round_key`(`storeId`, `round`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Score` (
    `id` VARCHAR(191) NOT NULL,
    `assessmentId` VARCHAR(191) NOT NULL,
    `questionId` INTEGER NOT NULL,
    `rawScore` INTEGER NULL,
    `displayScore` INTEGER NULL,
    `note` TEXT NULL,
    `suggestion` TEXT NULL,
    `status` ENUM('PENDING', 'SCORED', 'FLAGGED') NOT NULL DEFAULT 'PENDING',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Evidence` (
    `id` VARCHAR(191) NOT NULL,
    `scoreId` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RedFlag` (
    `id` VARCHAR(191) NOT NULL,
    `assessmentId` VARCHAR(191) NOT NULL,
    `type` ENUM('FOOD_SAFETY', 'FINANCIAL', 'OPERATION', 'MARKET', 'LEGAL', 'OWNER_READINESS', 'EVIDENCE', 'GROWTH') NOT NULL,
    `severity` ENUM('WARNING', 'CRITICAL') NOT NULL,
    `triggerQuestions` JSON NOT NULL,
    `recommendation` TEXT NULL,
    `resolved` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PitchingScore` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `judgeId` VARCHAR(191) NOT NULL,
    `round` VARCHAR(191) NOT NULL,
    `businessClarity` INTEGER NOT NULL,
    `productAppeal` INTEGER NOT NULL,
    `marketPlan` INTEGER NOT NULL,
    `financialUnderstanding` INTEGER NOT NULL,
    `ownerReadiness` INTEGER NOT NULL,
    `total` INTEGER NOT NULL,
    `comment` TEXT NULL,
    `strengths` JSON NOT NULL,
    `concerns` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PitchingScore_storeId_judgeId_round_key`(`storeId`, `judgeId`, `round`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IDP` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `mentorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `IDP_storeId_mentorId_key`(`storeId`, `mentorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IDPPlan` (
    `id` VARCHAR(191) NOT NULL,
    `idpId` VARCHAR(191) NOT NULL,
    `phase` ENUM('D7', 'D30', 'D90') NOT NULL,
    `issue` TEXT NOT NULL,
    `actionPlan` TEXT NOT NULL,
    `responsible` VARCHAR(191) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'DONE') NOT NULL DEFAULT 'PENDING',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MentoringLog` (
    `id` VARCHAR(191) NOT NULL,
    `idpId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `note` TEXT NOT NULL,
    `outcome` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FieldAudit` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `round` ENUM('T0', 'T1', 'T2', 'T3', 'T4') NOT NULL,
    `auditorId` VARCHAR(191) NOT NULL,
    `items` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Portfolio` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `dimensionId` INTEGER NOT NULL,
    `summary` TEXT NULL,
    `results` TEXT NULL,
    `files` JSON NOT NULL,
    `mentorNote` TEXT NULL,
    `status` ENUM('PENDING', 'COMPLETE') NOT NULL DEFAULT 'PENDING',
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Portfolio_storeId_dimensionId_key`(`storeId`, `dimensionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Report` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `format` VARCHAR(191) NOT NULL,
    `province` VARCHAR(191) NULL,
    `dateFrom` DATETIME(3) NULL,
    `dateTo` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'GENERATING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `fileUrl` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_AssignedAssessor` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_AssignedAssessor_AB_unique`(`A`, `B`),
    INDEX `_AssignedAssessor_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_dimensionId_fkey` FOREIGN KEY (`dimensionId`) REFERENCES `Dimension`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assessment` ADD CONSTRAINT `Assessment_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assessment` ADD CONSTRAINT `Assessment_assessorId_fkey` FOREIGN KEY (`assessorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Score` ADD CONSTRAINT `Score_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `Assessment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Score` ADD CONSTRAINT `Score_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evidence` ADD CONSTRAINT `Evidence_scoreId_fkey` FOREIGN KEY (`scoreId`) REFERENCES `Score`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RedFlag` ADD CONSTRAINT `RedFlag_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `Assessment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PitchingScore` ADD CONSTRAINT `PitchingScore_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PitchingScore` ADD CONSTRAINT `PitchingScore_judgeId_fkey` FOREIGN KEY (`judgeId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IDP` ADD CONSTRAINT `IDP_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IDP` ADD CONSTRAINT `IDP_mentorId_fkey` FOREIGN KEY (`mentorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IDPPlan` ADD CONSTRAINT `IDPPlan_idpId_fkey` FOREIGN KEY (`idpId`) REFERENCES `IDP`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MentoringLog` ADD CONSTRAINT `MentoringLog_idpId_fkey` FOREIGN KEY (`idpId`) REFERENCES `IDP`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FieldAudit` ADD CONSTRAINT `FieldAudit_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Portfolio` ADD CONSTRAINT `Portfolio_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_AssignedAssessor` ADD CONSTRAINT `_AssignedAssessor_A_fkey` FOREIGN KEY (`A`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_AssignedAssessor` ADD CONSTRAINT `_AssignedAssessor_B_fkey` FOREIGN KEY (`B`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
