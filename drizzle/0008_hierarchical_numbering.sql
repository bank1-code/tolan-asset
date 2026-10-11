ALTER TABLE `locations`
  ADD `code` varchar(20),
  ADD `assetPrefix` varchar(40),
  ADD `custodyPrefix` varchar(40),
  ADD `branchSequence` int NOT NULL DEFAULT 0,
  ADD `assetSequence` int NOT NULL DEFAULT 0,
  ADD `custodySequence` int NOT NULL DEFAULT 0,
  ADD `assetPrefixLocked` boolean NOT NULL DEFAULT false,
  ADD `custodyPrefixLocked` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `branches`
  ADD `code` varchar(30),
  ADD `sequenceNo` int,
  ADD `departmentSequence` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `departments`
  ADD `code` varchar(50),
  ADD `sequenceNo` int,
  ADD `employeeSequence` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `employees`
  ADD `code` varchar(80),
  ADD `sequenceNo` int;
--> statement-breakpoint
ALTER TABLE `assets`
  ADD `originLocationId` int,
  ADD CONSTRAINT `assets_originLocationId_locations_id_fk` FOREIGN KEY (`originLocationId`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `custody_items`
  ADD `originLocationId` int,
  ADD CONSTRAINT `custody_items_originLocationId_locations_id_fk` FOREIGN KEY (`originLocationId`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `app_settings`
  ADD `locationSequence` int NOT NULL DEFAULT 0;
--> statement-breakpoint
INSERT INTO `app_settings` (`id`, `systemName`, `systemSubtitle`, `locationSequence`)
VALUES (1, 'إدارة العهد والأصول', 'نظام سحابي متكامل', 0)
ON DUPLICATE KEY UPDATE `id` = `id`;
--> statement-breakpoint
UPDATE `locations` l
JOIN (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS seq
  FROM `locations`
) x ON x.id = l.id
SET l.code = LPAD(CAST(x.seq AS CHAR), GREATEST(2, CHAR_LENGTH(CAST(x.seq AS CHAR))), '0');
--> statement-breakpoint
UPDATE `app_settings`
SET `locationSequence` = (SELECT COUNT(*) FROM `locations`)
WHERE `id` = 1;
--> statement-breakpoint
UPDATE `branches` b
JOIN (
  SELECT id, locationId, ROW_NUMBER() OVER (PARTITION BY locationId ORDER BY id) AS seq
  FROM `branches`
) x ON x.id = b.id
JOIN `locations` l ON l.id = b.locationId
SET b.sequenceNo = x.seq,
    b.code = CONCAT(l.code, '-', LPAD(CAST(x.seq AS CHAR), GREATEST(2, CHAR_LENGTH(CAST(x.seq AS CHAR))), '0'));
--> statement-breakpoint
UPDATE `locations` l
SET l.branchSequence = (
  SELECT COUNT(*) FROM `branches` b WHERE b.locationId = l.id
);
--> statement-breakpoint
UPDATE `departments` d
JOIN (
  SELECT id, branchId, ROW_NUMBER() OVER (PARTITION BY branchId ORDER BY id) AS seq
  FROM `departments`
  WHERE branchId IS NOT NULL
) x ON x.id = d.id
JOIN `branches` b ON b.id = d.branchId
SET d.sequenceNo = x.seq,
    d.code = CONCAT(b.code, '-', LPAD(CAST(x.seq AS CHAR), GREATEST(3, CHAR_LENGTH(CAST(x.seq AS CHAR))), '0'));
--> statement-breakpoint
UPDATE `branches` b
SET b.departmentSequence = (
  SELECT COUNT(*) FROM `departments` d WHERE d.branchId = b.id
);
--> statement-breakpoint
UPDATE `employees` e
JOIN (
  SELECT id, departmentId, ROW_NUMBER() OVER (PARTITION BY departmentId ORDER BY id) AS seq
  FROM `employees`
  WHERE departmentId IS NOT NULL
) x ON x.id = e.id
JOIN `departments` d ON d.id = e.departmentId
SET e.sequenceNo = x.seq,
    e.code = CONCAT(d.code, '-', LPAD(CAST(x.seq AS CHAR), GREATEST(4, CHAR_LENGTH(CAST(x.seq AS CHAR))), '0'));
--> statement-breakpoint
UPDATE `departments` d
SET d.employeeSequence = (
  SELECT COUNT(*) FROM `employees` e WHERE e.departmentId = d.id
);
--> statement-breakpoint
UPDATE `assets` SET `originLocationId` = `locationId` WHERE `originLocationId` IS NULL;
--> statement-breakpoint
UPDATE `custody_items` SET `originLocationId` = `locationId` WHERE `originLocationId` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_code_unique` ON `locations` (`code`);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_assetPrefix_unique` ON `locations` (`assetPrefix`);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_custodyPrefix_unique` ON `locations` (`custodyPrefix`);
--> statement-breakpoint
CREATE UNIQUE INDEX `branches_code_unique` ON `branches` (`code`);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_code_unique` ON `departments` (`code`);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_code_unique` ON `employees` (`code`);
