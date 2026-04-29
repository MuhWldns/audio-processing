/*
  Warnings:

  - A unique constraint covering the columns `[username]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `user` ADD COLUMN `freeAudioDailyLimit` INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN `freeAudioDateKey` VARCHAR(10) NULL,
    ADD COLUMN `freeAudioUsedToday` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `fullName` VARCHAR(191) NULL,
    ADD COLUMN `isEmailVerified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
    ADD COLUMN `lastLoginProvider` ENUM('GOOGLE', 'DISCORD') NULL,
    ADD COLUMN `paidAudioTokenCost` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `username` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('LOGIN', 'LOGOUT', 'TOP_UP', 'TOKEN_USAGE', 'AUDIO_EXPORT', 'AUDIO_UPLOAD', 'FAILED_ACTION', 'REFUND', 'ROLLBACK') NOT NULL,
    `status` ENUM('INFO', 'SUCCESS', 'PENDING', 'FAILED') NOT NULL DEFAULT 'INFO',
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(512) NULL,
    `amountTokens` INTEGER NULL,
    `fileName` VARCHAR(255) NULL,
    `fileFormat` VARCHAR(32) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityLog_userId_idx`(`userId`),
    INDEX `ActivityLog_type_idx`(`type`),
    INDEX `ActivityLog_status_idx`(`status`),
    INDEX `ActivityLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UploadRecord` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `source` VARCHAR(64) NULL,
    `fileFormat` VARCHAR(32) NOT NULL,
    `durationSec` INTEGER NULL,
    `speedFactor` DECIMAL(6, 2) NULL,
    `amplification` DECIMAL(6, 2) NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `activityLogId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UploadRecord_activityLogId_key`(`activityLogId`),
    INDEX `UploadRecord_userId_idx`(`userId`),
    INDEX `UploadRecord_status_idx`(`status`),
    INDEX `UploadRecord_fileFormat_idx`(`fileFormat`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TopUpOrder` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `walletId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(64) NOT NULL,
    `externalId` VARCHAR(191) NULL,
    `currency` VARCHAR(16) NOT NULL,
    `amountPaid` DECIMAL(12, 2) NOT NULL,
    `tokensBought` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `activityLogId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TopUpOrder_externalId_key`(`externalId`),
    UNIQUE INDEX `TopUpOrder_activityLogId_key`(`activityLogId`),
    INDEX `TopUpOrder_userId_idx`(`userId`),
    INDEX `TopUpOrder_walletId_idx`(`walletId`),
    INDEX `TopUpOrder_status_idx`(`status`),
    INDEX `TopUpOrder_provider_idx`(`provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `User_username_key` ON `User`(`username`);

-- CreateIndex
CREATE INDEX `User_username_idx` ON `User`(`username`);

-- CreateIndex
CREATE INDEX `User_lastLoginAt_idx` ON `User`(`lastLoginAt`);

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UploadRecord` ADD CONSTRAINT `UploadRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UploadRecord` ADD CONSTRAINT `UploadRecord_activityLogId_fkey` FOREIGN KEY (`activityLogId`) REFERENCES `ActivityLog`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TopUpOrder` ADD CONSTRAINT `TopUpOrder_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TopUpOrder` ADD CONSTRAINT `TopUpOrder_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TopUpOrder` ADD CONSTRAINT `TopUpOrder_activityLogId_fkey` FOREIGN KEY (`activityLogId`) REFERENCES `ActivityLog`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
