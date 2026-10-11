ALTER TABLE `inventory_differences` ADD `itemSnapshot` json;--> statement-breakpoint
ALTER TABLE `inventory_differences` ADD `workQuantity` int;--> statement-breakpoint
ALTER TABLE `inventory_differences` ADD `identityMismatch` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD `scope` json;--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD `reviewNote` text;--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD `overlapReason` text;--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD `submittedAt` timestamp;--> statement-breakpoint
ALTER TABLE `inventory_sessions` ADD `lastSaveKey` varchar(100);