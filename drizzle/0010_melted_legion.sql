CREATE TABLE `exclusion_drafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdBy` int NOT NULL,
	`payload` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exclusion_drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `asset_exclusions` ADD `entityName` varchar(500);--> statement-breakpoint
ALTER TABLE `asset_exclusions` ADD `entityCode` varchar(100);--> statement-breakpoint
ALTER TABLE `asset_exclusions` ADD `originalQuantity` int;--> statement-breakpoint
ALTER TABLE `asset_exclusions` ADD `previouslyExcluded` int;--> statement-breakpoint
ALTER TABLE `asset_exclusions` ADD `effectiveDate` date;--> statement-breakpoint
ALTER TABLE `asset_exclusions` ADD CONSTRAINT `asset_exclusions_exclusionCode_unique` UNIQUE(`exclusionCode`);--> statement-breakpoint
ALTER TABLE `exclusion_sequence` ADD CONSTRAINT `exclusion_sequence_year_unique` UNIQUE(`year`);--> statement-breakpoint
ALTER TABLE `exclusion_drafts` ADD CONSTRAINT `exclusion_drafts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;