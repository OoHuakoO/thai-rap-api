/*
  Warnings:

  - Made the column `mainProblems` on table `Store` required. This step will fail if there are existing NULL values in that column.
  - Made the column `goals` on table `Store` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill existing NULLs before making the columns required
UPDATE `Store` SET `mainProblems` = JSON_ARRAY() WHERE `mainProblems` IS NULL;
UPDATE `Store` SET `goals` = JSON_ARRAY() WHERE `goals` IS NULL;

-- AlterTable
ALTER TABLE `Store` MODIFY `mainProblems` JSON NOT NULL DEFAULT ('[]'),
    MODIFY `goals` JSON NOT NULL DEFAULT ('[]');
