-- AlterTable
ALTER TABLE `Store` ADD COLUMN `code` VARCHAR(191) NOT NULL,
    MODIFY `province` VARCHAR(191) NULL,
    MODIFY `storeType` VARCHAR(191) NULL,
    MODIFY `ownerName` VARCHAR(191) NULL,
    MODIFY `phone` VARCHAR(191) NULL,
    MODIFY `address` TEXT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Store_code_key` ON `Store`(`code`);

-- CreateTable
CREATE TABLE `StoreType` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nameTh` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `StoreType_nameTh_key`(`nameTh`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
