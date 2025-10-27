CREATE TABLE `pdf_translate_com_core_team_invitations` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`email` text(255) NOT NULL,
	`roleId` text NOT NULL,
	`isSystemRole` integer DEFAULT 1 NOT NULL,
	`token` text(255) NOT NULL,
	`invitedBy` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`acceptedAt` integer,
	`acceptedBy` text,
	FOREIGN KEY (`teamId`) REFERENCES `pdf_translate_com_core_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invitedBy`) REFERENCES `pdf_translate_com_core_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`acceptedBy`) REFERENCES `pdf_translate_com_core_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_pdf_translate_com_core_team_invitations_token` ON `pdf_translate_com_core_team_invitations` (`token`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_team_invitations_team_id` ON `pdf_translate_com_core_team_invitations` (`teamId`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_team_invitations_email` ON `pdf_translate_com_core_team_invitations` (`email`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_team_invitations_token` ON `pdf_translate_com_core_team_invitations` (`token`);--> statement-breakpoint
CREATE TABLE `pdf_translate_com_core_team_memberships` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`userId` text NOT NULL,
	`roleId` text NOT NULL,
	`isSystemRole` integer DEFAULT 1 NOT NULL,
	`invitedBy` text,
	`invitedAt` integer,
	`joinedAt` integer,
	`expiresAt` integer,
	`isActive` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `pdf_translate_com_core_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `pdf_translate_com_core_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invitedBy`) REFERENCES `pdf_translate_com_core_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_team_memberships_team_id` ON `pdf_translate_com_core_team_memberships` (`teamId`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_team_memberships_user_id` ON `pdf_translate_com_core_team_memberships` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_team_memberships_unique` ON `pdf_translate_com_core_team_memberships` (`teamId`,`userId`);--> statement-breakpoint
CREATE TABLE `pdf_translate_com_core_team_roles` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`name` text(255) NOT NULL,
	`description` text(1000),
	`permissions` text NOT NULL,
	`metadata` text(5000),
	`isEditable` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `pdf_translate_com_core_teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_team_roles_team_id` ON `pdf_translate_com_core_team_roles` (`teamId`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_team_roles_name_unique` ON `pdf_translate_com_core_team_roles` (`teamId`,`name`);--> statement-breakpoint
CREATE TABLE `pdf_translate_com_core_teams` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`slug` text(255) NOT NULL,
	`description` text(1000),
	`avatarUrl` text(600),
	`settings` text(10000),
	`billingEmail` text(255),
	`planId` text(100),
	`planExpiresAt` integer,
	`creditBalance` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_pdf_translate_com_core_teams_slug` ON `pdf_translate_com_core_teams` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_teams_slug` ON `pdf_translate_com_core_teams` (`slug`);
