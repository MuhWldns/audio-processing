-- AlterTable
ALTER TABLE `gamewhitelist` ADD COLUMN `creatorId` VARCHAR(64) NULL,
    ADD COLUMN `creatorType` VARCHAR(16) NULL,
    ADD COLUMN `universeId` VARCHAR(64) NULL,
    ADD COLUMN `verifiedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `robloxUserId` VARCHAR(64) NULL;
