CREATE TABLE `pdf_translate_com_core_passkey_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`userId` text NOT NULL,
	`credentialId` text(255) NOT NULL,
	`credentialPublicKey` text(255) NOT NULL,
	`counter` integer NOT NULL,
	`transports` text(255),
	`aaguid` text(255),
	`userAgent` text(255),
	`ipAddress` text(100),
	FOREIGN KEY (`userId`) REFERENCES `pdf_translate_com_core_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_pdf_translate_com_core_passkey_credentials_credential_id` ON `pdf_translate_com_core_passkey_credentials` (`credentialId`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_passkey_credentials_user_id` ON `pdf_translate_com_core_passkey_credentials` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_passkey_credentials_credential_id` ON `pdf_translate_com_core_passkey_credentials` (`credentialId`);
