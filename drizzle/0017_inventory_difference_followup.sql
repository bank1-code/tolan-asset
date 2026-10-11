CREATE TABLE `inventory_difference_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`differenceId` int NOT NULL,
	`actionType` varchar(20) NOT NULL,
	`quantity` int NOT NULL DEFAULT 0,
	`operationKey` varchar(100),
	`note` text NOT NULL,
	`evidence` json,
	`performedBy` int NOT NULL,
	`performedByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_difference_actions_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_difference_actions_operationKey_unique` UNIQUE(`operationKey`)
);
--> statement-breakpoint
ALTER TABLE `inventory_difference_actions` ADD CONSTRAINT `inventory_diff_action_difference_fk` FOREIGN KEY (`differenceId`) REFERENCES `inventory_differences`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_difference_actions` ADD CONSTRAINT `inventory_difference_actions_performedBy_users_id_fk` FOREIGN KEY (`performedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;