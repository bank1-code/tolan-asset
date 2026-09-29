ALTER TABLE `users` MODIFY COLUMN `role` enum('user','owner','admin','accountant','employee') NOT NULL DEFAULT 'employee';
--> statement-breakpoint
UPDATE `users` SET `role` = 'employee' WHERE `role` = 'user';
--> statement-breakpoint
UPDATE `users` SET `role` = 'owner' WHERE `username` = 'anem2031';
--> statement-breakpoint
UPDATE `users` SET `role` = 'admin' WHERE `username` = 'admina';
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('owner','admin','accountant','employee') NOT NULL DEFAULT 'employee';
--> statement-breakpoint
ALTER TABLE `departments` ADD `locationId` int;
--> statement-breakpoint
ALTER TABLE `employees` ADD `departmentId` int;
--> statement-breakpoint
ALTER TABLE `users` ADD `employeeId` int;
--> statement-breakpoint
ALTER TABLE `departments` ADD CONSTRAINT `departments_locationId_locations_id_fk` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_departmentId_departments_id_fk` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;
