CREATE TABLE `branches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `locationId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `branches_id` PRIMARY KEY(`id`),
  CONSTRAINT `branches_locationId_locations_id_fk` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
ALTER TABLE `departments` ADD `branchId` int;
--> statement-breakpoint
INSERT INTO `branches` (`name`, `locationId`)
SELECT CONCAT('الفرع الافتراضي - ', l.`name`), l.`id`
FROM `locations` l
WHERE NOT EXISTS (SELECT 1 FROM `branches` b WHERE b.`locationId` = l.`id`);
--> statement-breakpoint
UPDATE `departments` d
JOIN `branches` b ON b.`locationId` = d.`locationId`
SET d.`branchId` = b.`id`
WHERE d.`branchId` IS NULL;
--> statement-breakpoint
ALTER TABLE `departments` ADD CONSTRAINT `departments_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
