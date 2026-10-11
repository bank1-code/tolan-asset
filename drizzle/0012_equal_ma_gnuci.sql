CREATE TABLE `exclusion_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`exclusionId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`url` text NOT NULL,
	`contentType` varchar(100) NOT NULL,
	`createdBy` int NOT NULL,
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exclusion_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `archive_documents` ADD `exclusionId` int;--> statement-breakpoint
ALTER TABLE `archive_documents` ADD `inventorySessionId` int;--> statement-breakpoint
ALTER TABLE `archive_documents` ADD `sourceKey` varchar(100);--> statement-breakpoint
ALTER TABLE `archive_documents` ADD `snapshot` json;--> statement-breakpoint
ALTER TABLE `asset_exclusions` ADD `originalUnitValue` decimal(12,2);--> statement-breakpoint
ALTER TABLE `asset_exclusions` ADD `entitySnapshot` json;--> statement-breakpoint
ALTER TABLE `archive_documents` ADD CONSTRAINT `archive_documents_sourceKey_unique` UNIQUE(`sourceKey`);--> statement-breakpoint
ALTER TABLE `exclusion_attachments` ADD CONSTRAINT `exclusion_attachments_exclusionId_asset_exclusions_id_fk` FOREIGN KEY (`exclusionId`) REFERENCES `asset_exclusions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exclusion_attachments` ADD CONSTRAINT `exclusion_attachments_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;