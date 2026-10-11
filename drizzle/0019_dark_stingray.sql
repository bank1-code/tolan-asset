CREATE TABLE `depreciation_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(20) NOT NULL,
	`entityId` int NOT NULL,
	`classificationId` int NOT NULL,
	`policyId` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'DRAFT',
	`version` int NOT NULL DEFAULT 0,
	`payload` json NOT NULL,
	`createdBy` int NOT NULL,
	`updatedBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `depreciation_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `depreciation_control` (
	`id` int NOT NULL,
	`revision` int NOT NULL DEFAULT 0,
	CONSTRAINT `depreciation_control_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `depreciation_exports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromDate` date NOT NULL,
	`toDate` date NOT NULL,
	`snapshot` json NOT NULL,
	`contentHash` varchar(64) NOT NULL,
	`exportedBy` int NOT NULL,
	`exportedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `depreciation_exports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `depreciation_journals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(60) NOT NULL,
	`sourceKey` varchar(100) NOT NULL,
	`periodId` int,
	`movementId` int,
	`effectiveDate` date NOT NULL,
	`kind` varchar(30) NOT NULL,
	`snapshot` json NOT NULL,
	`approvedBy` int NOT NULL,
	`approvedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `depreciation_journals_id` PRIMARY KEY(`id`),
	CONSTRAINT `depreciation_journals_code_unique` UNIQUE(`code`),
	CONSTRAINT `depreciation_journals_sourceKey_unique` UNIQUE(`sourceKey`)
);
--> statement-breakpoint
CREATE TABLE `depreciation_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`kind` varchar(30) NOT NULL,
	`effectiveDate` date NOT NULL,
	`sourceKey` varchar(100),
	`status` varchar(20) NOT NULL DEFAULT 'DRAFT',
	`version` int NOT NULL DEFAULT 0,
	`payload` json NOT NULL,
	`createdBy` int NOT NULL,
	`updatedBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `depreciation_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `depreciation_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`month` varchar(7) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'DRAFT',
	`version` int NOT NULL DEFAULT 0,
	`snapshot` json NOT NULL,
	`inputHash` varchar(64) NOT NULL,
	`createdBy` int NOT NULL,
	`updatedBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`closedBy` int,
	`closedAt` timestamp,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `depreciation_periods_id` PRIMARY KEY(`id`),
	CONSTRAINT `depreciation_periods_month_unique` UNIQUE(`month`)
);
--> statement-breakpoint
CREATE TABLE `depreciation_policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'DRAFT',
	`version` int NOT NULL DEFAULT 0,
	`effectiveDate` date NOT NULL,
	`payload` json NOT NULL,
	`createdBy` int NOT NULL,
	`updatedBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `depreciation_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_classifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`name` varchar(255) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `financial_classifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `financial_classifications_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `assets` ADD `classificationId` int;--> statement-breakpoint
ALTER TABLE `custody_items` ADD `classificationId` int;--> statement-breakpoint
ALTER TABLE `depreciation_batches` ADD CONSTRAINT `dep_batch_classification_fk` FOREIGN KEY (`classificationId`) REFERENCES `financial_classifications`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_batches` ADD CONSTRAINT `depreciation_batches_policyId_depreciation_policies_id_fk` FOREIGN KEY (`policyId`) REFERENCES `depreciation_policies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_batches` ADD CONSTRAINT `depreciation_batches_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_batches` ADD CONSTRAINT `depreciation_batches_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_batches` ADD CONSTRAINT `depreciation_batches_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_exports` ADD CONSTRAINT `depreciation_exports_exportedBy_users_id_fk` FOREIGN KEY (`exportedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_journals` ADD CONSTRAINT `depreciation_journals_periodId_depreciation_periods_id_fk` FOREIGN KEY (`periodId`) REFERENCES `depreciation_periods`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_journals` ADD CONSTRAINT `depreciation_journals_movementId_depreciation_movements_id_fk` FOREIGN KEY (`movementId`) REFERENCES `depreciation_movements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_journals` ADD CONSTRAINT `depreciation_journals_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_movements` ADD CONSTRAINT `depreciation_movements_batchId_depreciation_batches_id_fk` FOREIGN KEY (`batchId`) REFERENCES `depreciation_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_movements` ADD CONSTRAINT `depreciation_movements_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_movements` ADD CONSTRAINT `depreciation_movements_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_movements` ADD CONSTRAINT `depreciation_movements_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_periods` ADD CONSTRAINT `depreciation_periods_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_periods` ADD CONSTRAINT `depreciation_periods_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_periods` ADD CONSTRAINT `depreciation_periods_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_periods` ADD CONSTRAINT `depreciation_periods_closedBy_users_id_fk` FOREIGN KEY (`closedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_policies` ADD CONSTRAINT `depreciation_policies_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_policies` ADD CONSTRAINT `depreciation_policies_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `depreciation_policies` ADD CONSTRAINT `depreciation_policies_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assets` ADD CONSTRAINT `assets_classificationId_financial_classifications_id_fk` FOREIGN KEY (`classificationId`) REFERENCES `financial_classifications`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `custody_items` ADD CONSTRAINT `custody_items_classificationId_financial_classifications_id_fk` FOREIGN KEY (`classificationId`) REFERENCES `financial_classifications`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT IGNORE INTO `depreciation_control` (`id`, `revision`) VALUES (1, 0);
