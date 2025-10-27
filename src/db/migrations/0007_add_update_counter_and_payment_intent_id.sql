ALTER TABLE `pdf_translate_com_fin_credit_transactions` ADD `updateCounter` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `pdf_translate_com_fin_credit_transactions` ADD `paymentIntentId` text(255);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_fin_credit_transactions_payment_intent_id` ON `pdf_translate_com_fin_credit_transactions` (`paymentIntentId`);--> statement-breakpoint
ALTER TABLE `pdf_translate_com_core_passkey_credentials` ADD `updateCounter` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `pdf_translate_com_core_purchased_items` ADD `updateCounter` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `pdf_translate_com_core_users` ADD `updateCounter` integer DEFAULT 0;
