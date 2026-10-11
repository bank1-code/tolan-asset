-- Align fresh installations with the existing inventory-session SQL layout.
ALTER TABLE `inventory_sessions` CHANGE `sessionType` `entityType` varchar(20) NOT NULL;
--> statement-breakpoint
ALTER TABLE `inventory_sessions` CHANGE `totalCount` `totalItems` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `inventory_sessions` CHANGE `scannedCount` `scannedItems` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `inventory_sessions` CHANGE `missingCount` `missingItems` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `inventory_sessions` CHANGE `items` `sessionData` json NULL;
