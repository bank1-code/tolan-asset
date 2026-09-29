CREATE TABLE `inventory_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`departmentId` int,
	`departmentName` varchar(255),
	`sessionType` enum('assets','custody') NOT NULL,
	`totalCount` int NOT NULL DEFAULT 0,
	`scannedCount` int NOT NULL DEFAULT 0,
	`missingCount` int NOT NULL DEFAULT 0,
	`items` json NOT NULL,
	`performedBy` int,
	`performedByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD CONSTRAINT `inventory_sessions_departmentId_departments_id_fk` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD CONSTRAINT `inventory_sessions_performedBy_users_id_fk` FOREIGN KEY (`performedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;