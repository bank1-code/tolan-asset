CREATE TABLE `inventory_differences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`entityType` varchar(20) NOT NULL,
	`entityId` int NOT NULL,
	`code` varchar(100) NOT NULL,
	`name` varchar(500) NOT NULL,
	`expectedQuantity` int NOT NULL,
	`actualQuantity` int NOT NULL,
	`difference` int NOT NULL,
	`reason` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_differences_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_differences_session_entity_unique` UNIQUE(`sessionId`,`entityType`,`entityId`)
);
--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD `status` varchar(20) DEFAULT 'APPROVED' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD `version` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD `approvedBy` int;--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD `approvedByName` varchar(255);--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `inventory_differences` ADD CONSTRAINT `inventory_differences_sessionId_inventory_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `inventory_sessions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD CONSTRAINT `inventory_sessions_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;