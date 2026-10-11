CREATE TABLE `inventory_approval_numbers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(20) NOT NULL,
	`entityId` int NOT NULL,
	`code` varchar(100) NOT NULL,
	`approvedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_approval_numbers_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_approval_number_unique` UNIQUE(`entityType`,`code`),
	CONSTRAINT `inventory_approval_entity_unique` UNIQUE(`entityType`,`entityId`)
);
--> statement-breakpoint
ALTER TABLE `assets` MODIFY COLUMN `status` varchar(30) NOT NULL DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TABLE `custody_items` MODIFY COLUMN `status` varchar(30) NOT NULL DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TABLE `assets` ADD `draftVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `approvedBy` int;--> statement-breakpoint
ALTER TABLE `assets` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `assets` ADD `approvalSnapshot` json;--> statement-breakpoint
ALTER TABLE `assets` ADD `reviewNote` text;--> statement-breakpoint
ALTER TABLE `custody_items` ADD `draftVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `custody_items` ADD `approvedBy` int;--> statement-breakpoint
ALTER TABLE `custody_items` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `custody_items` ADD `approvalSnapshot` json;--> statement-breakpoint
ALTER TABLE `custody_items` ADD `reviewNote` text;--> statement-breakpoint
ALTER TABLE `inventory_approval_numbers` ADD CONSTRAINT `inventory_approval_numbers_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assets` ADD CONSTRAINT `assets_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `custody_items` ADD CONSTRAINT `custody_items_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;