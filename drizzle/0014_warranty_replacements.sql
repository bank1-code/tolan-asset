CREATE TABLE `warranty_replacements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(20) NOT NULL,
	`entityId` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'DRAFT',
	`version` int NOT NULL DEFAULT 0,
	`payload` json NOT NULL,
	`sourceSnapshot` json NOT NULL,
	`executionSnapshot` json,
	`replacementEntityId` int,
	`operationCode` varchar(50),
	`createdBy` int NOT NULL,
	`createdByName` varchar(255),
	`executedBy` int,
	`executedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `warranty_replacements_id` PRIMARY KEY(`id`),
	CONSTRAINT `warranty_replacements_operationCode_unique` UNIQUE(`operationCode`),
	CONSTRAINT `warranty_replacement_entity_unique` UNIQUE(`entityType`,`replacementEntityId`)
);
--> statement-breakpoint
ALTER TABLE `assets` ADD `warrantyReplacedQuantity` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `serialNumbers` json;--> statement-breakpoint
ALTER TABLE `assets` ADD `warrantyStartDate` date;--> statement-breakpoint
ALTER TABLE `assets` ADD `warrantyEndDate` date;--> statement-breakpoint
ALTER TABLE `custody_items` ADD `warrantyReplacedQuantity` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `custody_items` ADD `serialNumbers` json;--> statement-breakpoint
ALTER TABLE `custody_items` ADD `warrantyStartDate` date;--> statement-breakpoint
ALTER TABLE `custody_items` ADD `warrantyEndDate` date;--> statement-breakpoint
ALTER TABLE `warranty_replacements` ADD CONSTRAINT `warranty_replacements_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warranty_replacements` ADD CONSTRAINT `warranty_replacements_executedBy_users_id_fk` FOREIGN KEY (`executedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;