CREATE TABLE `pdf_translate_com_core_users` (
  `id` text PRIMARY KEY NOT NULL,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL,
  `firstName` text(255),
  `lastName` text(255),
  `email` text(255),
  `passwordHash` text,
  `role` text DEFAULT 'user' NOT NULL,
  `unlimitedUsageUntil` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_pdf_translate_com_core_users_email` ON `pdf_translate_com_core_users` (`email`);
