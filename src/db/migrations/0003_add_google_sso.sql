ALTER TABLE `pdf_translate_com_core_users` ADD `signUpIpAddress` text(100);--> statement-breakpoint
ALTER TABLE `pdf_translate_com_core_users` ADD `googleAccountId` text(255);--> statement-breakpoint
ALTER TABLE `pdf_translate_com_core_users` ADD `avatar` text(600);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_users_email` ON `pdf_translate_com_core_users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_users_google_account_id` ON `pdf_translate_com_core_users` (`googleAccountId`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_users_role` ON `pdf_translate_com_core_users` (`role`);
