/*
  Warnings:

  - You are about to drop the column `amountTokens` on the `activitylog` table. All the data in the column will be lost.
  - You are about to drop the column `amountPaid` on the `topuporder` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `topuporder` table. All the data in the column will be lost.
  - You are about to drop the column `tokensBought` on the `topuporder` table. All the data in the column will be lost.
  - You are about to drop the column `walletId` on the `topuporder` table. All the data in the column will be lost.
  - You are about to drop the column `reservedTokens` on the `usageevent` table. All the data in the column will be lost.
  - You are about to drop the column `settledTokens` on the `usageevent` table. All the data in the column will be lost.
  - You are about to drop the column `tokenCost` on the `usageevent` table. All the data in the column will be lost.
  - You are about to drop the column `walletId` on the `usageevent` table. All the data in the column will be lost.
  - You are about to drop the column `paidAudioTokenCost` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `totalSpentRupiah` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `totalTopUpRupiah` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `walletBalanceRupiah` on the `user` table. All the data in the column will be lost.
  - You are about to drop the `servicetransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tokentransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `topuptransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `wallet` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `amountRupiah` to the `TopUpOrder` table without a default value. This is not possible if the table is not empty.
  - Added the required column `costRupiah` to the `UsageEvent` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `servicetransaction` DROP FOREIGN KEY `ServiceTransaction_userId_fkey`;

-- DropForeignKey
ALTER TABLE `tokentransaction` DROP FOREIGN KEY `TokenTransaction_userId_fkey`;

-- DropForeignKey
ALTER TABLE `tokentransaction` DROP FOREIGN KEY `TokenTransaction_walletId_fkey`;

-- DropForeignKey
ALTER TABLE `topuporder` DROP FOREIGN KEY `TopUpOrder_walletId_fkey`;

-- DropForeignKey
ALTER TABLE `topuptransaction` DROP FOREIGN KEY `TopUpTransaction_userId_fkey`;

-- DropForeignKey
ALTER TABLE `usageevent` DROP FOREIGN KEY `UsageEvent_walletId_fkey`;

-- DropForeignKey
ALTER TABLE `wallet` DROP FOREIGN KEY `Wallet_userId_fkey`;

-- DropIndex
DROP INDEX `TopUpOrder_walletId_idx` ON `topuporder`;

-- DropIndex
DROP INDEX `UsageEvent_walletId_idx` ON `usageevent`;

-- DropIndex
DROP INDEX `User_totalSpentRupiah_idx` ON `user`;

-- DropIndex
DROP INDEX `User_walletBalanceRupiah_idx` ON `user`;

-- AlterTable
ALTER TABLE `activitylog` DROP COLUMN `amountTokens`,
    ADD COLUMN `amountRupiah` INTEGER NULL;

-- AlterTable
ALTER TABLE `topuporder` DROP COLUMN `amountPaid`,
    DROP COLUMN `currency`,
    DROP COLUMN `tokensBought`,
    DROP COLUMN `walletId`,
    ADD COLUMN `amountRupiah` INTEGER NOT NULL,
    ADD COLUMN `finalAmount` INTEGER NULL;

-- AlterTable
ALTER TABLE `usageevent` DROP COLUMN `reservedTokens`,
    DROP COLUMN `settledTokens`,
    DROP COLUMN `tokenCost`,
    DROP COLUMN `walletId`,
    ADD COLUMN `costRupiah` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `user` DROP COLUMN `paidAudioTokenCost`,
    DROP COLUMN `totalSpentRupiah`,
    DROP COLUMN `totalTopUpRupiah`,
    DROP COLUMN `walletBalanceRupiah`,
    ADD COLUMN `paidAudioCost` INTEGER NOT NULL DEFAULT 2000,
    ADD COLUMN `totalSpent` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `totalTopUp` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `walletBalance` INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE `servicetransaction`;

-- DropTable
DROP TABLE `tokentransaction`;

-- DropTable
DROP TABLE `topuptransaction`;

-- DropTable
DROP TABLE `wallet`;

-- CreateTable
CREATE TABLE `WalletTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('TOP_UP', 'PURCHASE', 'AUDIO_CHARGE', 'REFUND', 'ADJUSTMENT') NOT NULL,
    `amount` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `referenceType` VARCHAR(64) NULL,
    `referenceId` VARCHAR(191) NULL,
    `description` VARCHAR(512) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WalletTransaction_userId_idx`(`userId`),
    INDEX `WalletTransaction_type_idx`(`type`),
    INDEX `WalletTransaction_referenceType_referenceId_idx`(`referenceType`, `referenceId`),
    INDEX `WalletTransaction_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `User_walletBalance_idx` ON `User`(`walletBalance`);

-- CreateIndex
CREATE INDEX `User_totalSpent_idx` ON `User`(`totalSpent`);

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
