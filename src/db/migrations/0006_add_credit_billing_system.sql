CREATE TABLE `pdf_translate_com_fin_credit_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`userId` text NOT NULL,
	`amount` integer NOT NULL,
	`remainingAmount` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`description` text(255) NOT NULL,
	`expirationDate` integer,
	`expirationDateProcessedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `pdf_translate_com_core_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_fin_credit_transactions_user_id` ON `pdf_translate_com_fin_credit_transactions` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_fin_credit_transactions_type` ON `pdf_translate_com_fin_credit_transactions` (`type`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_fin_credit_transactions_created_at` ON `pdf_translate_com_fin_credit_transactions` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_fin_credit_transactions_expiration_date` ON `pdf_translate_com_fin_credit_transactions` (`expirationDate`);--> statement-breakpoint
CREATE TABLE `pdf_translate_com_core_purchased_items` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`userId` text NOT NULL,
	`itemType` text NOT NULL,
	`itemId` text NOT NULL,
	`purchasedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `pdf_translate_com_core_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_purchased_items_user_id` ON `pdf_translate_com_core_purchased_items` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_purchased_items_type` ON `pdf_translate_com_core_purchased_items` (`itemType`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_purchased_items_user_item` ON `pdf_translate_com_core_purchased_items` (`userId`,`itemType`,`itemId`);--> statement-breakpoint
ALTER TABLE `pdf_translate_com_core_users` ADD `currentCredits` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `pdf_translate_com_core_users` ADD `lastCreditRefreshAt` integer;
