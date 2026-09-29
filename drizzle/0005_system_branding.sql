CREATE TABLE `app_settings` (
	`id` int NOT NULL,
	`systemName` varchar(150) NOT NULL DEFAULT 'إدارة العهد والأصول',
	`systemSubtitle` varchar(200) NOT NULL DEFAULT 'نظام سحابي متكامل',
	`logoUrl` text,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `app_settings` ADD CONSTRAINT `app_settings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
