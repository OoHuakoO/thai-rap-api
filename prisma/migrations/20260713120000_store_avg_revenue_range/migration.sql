/*
  Warnings:

  - Renamed the column `avgRevenue` on table `Store` to `avgRevenueMin` (existing values are preserved).
  - Added the column `avgRevenueMax` to table `Store`.

*/
-- RenameColumn (preserves existing avgRevenue values as avgRevenueMin)
ALTER TABLE `Store` CHANGE `avgRevenue` `avgRevenueMin` DOUBLE NULL;

-- AddColumn
ALTER TABLE `Store` ADD COLUMN `avgRevenueMax` DOUBLE NULL;
