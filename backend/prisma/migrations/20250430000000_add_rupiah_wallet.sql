-- Migration: Add Rupiah wallet system
-- This migrates from token-based to Rupiah-based wallet

-- 1. Add Rupiah columns to User table
ALTER TABLE `User` 
ADD COLUMN `walletBalanceRupiah` INT NOT NULL DEFAULT 0,
ADD COLUMN `totalTopUpRupiah` INT NOT NULL DEFAULT 0,
ADD COLUMN `totalSpentRupiah` INT NOT NULL DEFAULT 0;

-- 2. Create TopUpTransaction table
CREATE TABLE `TopUpTransaction` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `amountRupiah` INT NOT NULL,
  `paymentGateway` VARCHAR(64) NOT NULL,
  `paymentId` VARCHAR(191),
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `metadata` JSON,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `TopUpTransaction_paymentId_key` (`paymentId`),
  INDEX `TopUpTransaction_userId_idx` (`userId`),
  INDEX `TopUpTransaction_status_idx` (`status`),
  INDEX `TopUpTransaction_paymentGateway_idx` (`paymentGateway`),
  
  CONSTRAINT `TopUpTransaction_userId_fkey` 
    FOREIGN KEY (`userId`) 
    REFERENCES `User` (`id`) 
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create ServiceTransaction table
CREATE TABLE `ServiceTransaction` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `amountRupiah` INT NOT NULL,
  `durationSeconds` INT NOT NULL,
  `processingType` VARCHAR(32) NOT NULL DEFAULT 'basic',
  `serviceType` VARCHAR(32) NOT NULL DEFAULT 'audio_processing',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `metadata` JSON,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  
  PRIMARY KEY (`id`),
  INDEX `ServiceTransaction_userId_idx` (`userId`),
  INDEX `ServiceTransaction_status_idx` (`status`),
  INDEX `ServiceTransaction_serviceType_idx` (`serviceType`),
  
  CONSTRAINT `ServiceTransaction_userId_fkey` 
    FOREIGN KEY (`userId`) 
    REFERENCES `User` (`id`) 
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Update existing Wallet table to keep for backward compatibility
-- We'll keep the token columns but add Rupiah equivalents
ALTER TABLE `Wallet`
ADD COLUMN `balanceRupiah` INT NOT NULL DEFAULT 0,
ADD COLUMN `lifetimeTopUpRupiah` INT NOT NULL DEFAULT 0,
ADD COLUMN `lifetimeSpentRupiah` INT NOT NULL DEFAULT 0;

-- 5. Create index for faster wallet queries
CREATE INDEX `User_walletBalanceRupiah_idx` ON `User` (`walletBalanceRupiah`);
CREATE INDEX `User_totalSpentRupiah_idx` ON `User` (`totalSpentRupiah`);