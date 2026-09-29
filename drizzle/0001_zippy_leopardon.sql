CREATE TABLE `archive_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`archiveDocumentId` int NOT NULL,
	`actionType` varchar(20) NOT NULL,
	`performedBy` int NOT NULL,
	`performedAt` timestamp NOT NULL DEFAULT (now()),
	`reason` text,
	CONSTRAINT `archive_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `archive_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(30) NOT NULL,
	`operationType` varchar(50) NOT NULL,
	`assetId` int,
	`custodyId` int,
	`transferId` int,
	`documentTitle` text NOT NULL,
	`fileName` text NOT NULL,
	`filePath` text,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `archive_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `asset_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assetId` int,
	`documentCode` varchar(50) NOT NULL,
	`documentType` varchar(50) NOT NULL,
	`documentDate` date,
	`filePath` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `asset_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `asset_exclusions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(20) NOT NULL,
	`entityId` int NOT NULL,
	`exclusionCode` varchar(50) NOT NULL,
	`exclusionMode` varchar(10) NOT NULL DEFAULT 'full',
	`exclusionTypeId` int,
	`reason` text NOT NULL,
	`quantityBefore` int,
	`quantityExcluded` int DEFAULT 1,
	`quantityRemaining` int,
	`oldEmployeeName` varchar(200),
	`oldDepartmentName` varchar(200),
	`oldLocationName` varchar(200),
	`responsibleData` json,
	`exclusionImages` json,
	`reportPath` text,
	`excludedBy` int,
	`exclusionDate` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `asset_exclusions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `asset_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(20) NOT NULL,
	`entityId` int NOT NULL,
	`movementType` varchar(20) NOT NULL,
	`fromEmployeeId` int,
	`toEmployeeId` int,
	`fromDepartment` varchar(255),
	`toDepartment` varchar(255),
	`fromLocation` varchar(255),
	`toLocation` varchar(255),
	`quantity` int DEFAULT 1,
	`assetValue` decimal(12,2),
	`notes` text,
	`transferredBy` int,
	`transferredAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `asset_transfers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assetName` varchar(500) NOT NULL,
	`assetCode` varchar(100),
	`quantity` int NOT NULL DEFAULT 1,
	`assetValue` decimal(12,2) DEFAULT '0',
	`condition` varchar(50) DEFAULT 'جيد جدًا',
	`assignedTo` int,
	`departmentId` int,
	`locationId` int,
	`status` varchar(30) NOT NULL DEFAULT 'ACTIVE',
	`notes` text,
	`assetImagePath` text,
	`invoiceImagePath` text,
	`excludedQuantity` int DEFAULT 0,
	`exclusionDate` timestamp,
	`excludedBy` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tableName` varchar(100) NOT NULL,
	`recordId` int,
	`actionType` varchar(20) NOT NULL,
	`actionDescription` text,
	`oldData` json,
	`newData` json,
	`changedFields` json,
	`performedBy` int,
	`performedByName` varchar(255),
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clearance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clearanceCode` varchar(50) NOT NULL,
	`employeeId` int NOT NULL,
	`employeeName` varchar(255) NOT NULL,
	`fingerprintId` varchar(50),
	`reason` varchar(50),
	`lastWorkDay` date,
	`htmlFilePath` text,
	`status` varchar(20) DEFAULT 'ACTIVE',
	`replacementData` json,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `clearance_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `custody_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`custodyId` int,
	`documentCode` varchar(50) NOT NULL,
	`documentType` varchar(50) NOT NULL,
	`documentDate` date,
	`filePath` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `custody_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `custody_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(500) NOT NULL,
	`code` varchar(100),
	`quantity` int NOT NULL DEFAULT 1,
	`assetValue` decimal(12,2) DEFAULT '0',
	`condition` varchar(50) DEFAULT 'جيد جدًا',
	`assignedTo` int,
	`departmentId` int,
	`locationId` int,
	`status` varchar(30) NOT NULL DEFAULT 'ACTIVE',
	`notes` text,
	`assetImagePath` text,
	`invoiceImagePath` text,
	`excludedQuantity` int DEFAULT 0,
	`exclusionDate` timestamp,
	`excludedBy` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custody_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `departments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`fingerprintId` varchar(100),
	`nationalId` varchar(100),
	`phone` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exclusion_sequence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`seq` int NOT NULL,
	CONSTRAINT `exclusion_sequence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exclusion_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exclusion_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `locations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `archive_audit` ADD CONSTRAINT `archive_audit_archiveDocumentId_archive_documents_id_fk` FOREIGN KEY (`archiveDocumentId`) REFERENCES `archive_documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `archive_audit` ADD CONSTRAINT `archive_audit_performedBy_users_id_fk` FOREIGN KEY (`performedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `archive_documents` ADD CONSTRAINT `archive_documents_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `asset_documents` ADD CONSTRAINT `asset_documents_assetId_assets_id_fk` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `asset_exclusions` ADD CONSTRAINT `asset_exclusions_exclusionTypeId_exclusion_types_id_fk` FOREIGN KEY (`exclusionTypeId`) REFERENCES `exclusion_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `asset_exclusions` ADD CONSTRAINT `asset_exclusions_excludedBy_users_id_fk` FOREIGN KEY (`excludedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `asset_transfers` ADD CONSTRAINT `asset_transfers_fromEmployeeId_employees_id_fk` FOREIGN KEY (`fromEmployeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `asset_transfers` ADD CONSTRAINT `asset_transfers_toEmployeeId_employees_id_fk` FOREIGN KEY (`toEmployeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `asset_transfers` ADD CONSTRAINT `asset_transfers_transferredBy_users_id_fk` FOREIGN KEY (`transferredBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assets` ADD CONSTRAINT `assets_assignedTo_employees_id_fk` FOREIGN KEY (`assignedTo`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assets` ADD CONSTRAINT `assets_departmentId_departments_id_fk` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assets` ADD CONSTRAINT `assets_locationId_locations_id_fk` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_performedBy_users_id_fk` FOREIGN KEY (`performedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clearance_records` ADD CONSTRAINT `clearance_records_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clearance_records` ADD CONSTRAINT `clearance_records_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `custody_documents` ADD CONSTRAINT `custody_documents_custodyId_custody_items_id_fk` FOREIGN KEY (`custodyId`) REFERENCES `custody_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `custody_items` ADD CONSTRAINT `custody_items_assignedTo_employees_id_fk` FOREIGN KEY (`assignedTo`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `custody_items` ADD CONSTRAINT `custody_items_departmentId_departments_id_fk` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `custody_items` ADD CONSTRAINT `custody_items_locationId_locations_id_fk` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;