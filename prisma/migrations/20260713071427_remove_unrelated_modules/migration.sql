/*
  Warnings:

  - You are about to drop the `FieldAudit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IDP` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IDPPlan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MentoringLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PitchingScore` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Portfolio` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Report` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `FieldAudit` DROP FOREIGN KEY `FieldAudit_storeId_fkey`;

-- DropForeignKey
ALTER TABLE `IDP` DROP FOREIGN KEY `IDP_mentorId_fkey`;

-- DropForeignKey
ALTER TABLE `IDP` DROP FOREIGN KEY `IDP_storeId_fkey`;

-- DropForeignKey
ALTER TABLE `IDPPlan` DROP FOREIGN KEY `IDPPlan_idpId_fkey`;

-- DropForeignKey
ALTER TABLE `MentoringLog` DROP FOREIGN KEY `MentoringLog_idpId_fkey`;

-- DropForeignKey
ALTER TABLE `PitchingScore` DROP FOREIGN KEY `PitchingScore_judgeId_fkey`;

-- DropForeignKey
ALTER TABLE `PitchingScore` DROP FOREIGN KEY `PitchingScore_storeId_fkey`;

-- DropForeignKey
ALTER TABLE `Portfolio` DROP FOREIGN KEY `Portfolio_storeId_fkey`;

-- DropTable
DROP TABLE `FieldAudit`;

-- DropTable
DROP TABLE `IDP`;

-- DropTable
DROP TABLE `IDPPlan`;

-- DropTable
DROP TABLE `MentoringLog`;

-- DropTable
DROP TABLE `PitchingScore`;

-- DropTable
DROP TABLE `Portfolio`;

-- DropTable
DROP TABLE `Report`;
