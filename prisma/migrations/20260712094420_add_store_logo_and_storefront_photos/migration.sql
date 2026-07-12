-- AlterTable
ALTER TABLE `Store` ADD COLUMN `logoUrl` VARCHAR(191) NULL,
    ADD COLUMN `storefrontPhotos` JSON NOT NULL;
