-- CreateTable
CREATE TABLE `Province` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nameTh` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Province_nameTh_key`(`nameTh`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
