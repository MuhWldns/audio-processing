-- CreateTable
CREATE TABLE `PublicIdCounter` (
    `id` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(32) NOT NULL,
    `nextNumber` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PublicIdCounter_scope_key`(`scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `publicId` VARCHAR(32) NULL;

-- AlterTable
ALTER TABLE `WalletTransaction` ADD COLUMN `publicId` VARCHAR(32) NULL;

-- AlterTable
ALTER TABLE `TopUpOrder` ADD COLUMN `publicId` VARCHAR(32) NULL;

-- AlterTable
ALTER TABLE `UsageEvent` ADD COLUMN `publicId` VARCHAR(32) NULL;

-- AlterTable
ALTER TABLE `UploadRecord` ADD COLUMN `publicId` VARCHAR(32) NULL;

-- AlterTable
ALTER TABLE `Product` ADD COLUMN `publicId` VARCHAR(32) NULL;

-- AlterTable
ALTER TABLE `License` ADD COLUMN `publicId` VARCHAR(32) NULL;

-- AlterTable
ALTER TABLE `Purchase` ADD COLUMN `publicId` VARCHAR(32) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_publicId_key` ON `User`(`publicId`);

-- CreateIndex
CREATE UNIQUE INDEX `WalletTransaction_publicId_key` ON `WalletTransaction`(`publicId`);

-- CreateIndex
CREATE UNIQUE INDEX `TopUpOrder_publicId_key` ON `TopUpOrder`(`publicId`);

-- CreateIndex
CREATE UNIQUE INDEX `UsageEvent_publicId_key` ON `UsageEvent`(`publicId`);

-- CreateIndex
CREATE UNIQUE INDEX `UploadRecord_publicId_key` ON `UploadRecord`(`publicId`);

-- CreateIndex
CREATE UNIQUE INDEX `Product_publicId_key` ON `Product`(`publicId`);

-- CreateIndex
CREATE UNIQUE INDEX `License_publicId_key` ON `License`(`publicId`);

-- CreateIndex
CREATE UNIQUE INDEX `Purchase_publicId_key` ON `Purchase`(`publicId`);
