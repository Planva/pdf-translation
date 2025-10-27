CREATE TABLE `pdf_translate_com_cfg_glossaries` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`teamId` text,
	`userId` text,
	`name` text(255) NOT NULL,
	`sourceLanguage` text(16) NOT NULL,
	`targetLanguage` text(16) NOT NULL,
	`industry` text(100),
	`description` text(1000),
	`isDefault` integer DEFAULT 0 NOT NULL,
	`entryCount` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `pdf_translate_com_core_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `pdf_translate_com_core_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_cfg_glossaries_team` ON `pdf_translate_com_cfg_glossaries` (`teamId`);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_cfg_glossaries_user` ON `pdf_translate_com_cfg_glossaries` (`userId`);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_cfg_glossaries_lang` ON `pdf_translate_com_cfg_glossaries` (`sourceLanguage`,`targetLanguage`);
--> statement-breakpoint
CREATE TABLE `pdf_translate_com_cfg_glossary_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`glossaryId` text NOT NULL,
	`sourceTerm` text(255) NOT NULL,
	`targetTerm` text(255) NOT NULL,
	`partOfSpeech` text(50),
	`description` text(1000),
	`synonyms` text,
	`attributes` text,
	FOREIGN KEY (`glossaryId`) REFERENCES `pdf_translate_com_cfg_glossaries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_cfg_glossary_entries_glossary` ON `pdf_translate_com_cfg_glossary_entries` (`glossaryId`);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_cfg_glossary_entries_term` ON `pdf_translate_com_cfg_glossary_entries` (`glossaryId`,`sourceTerm`);
--> statement-breakpoint
CREATE TABLE `pdf_translate_com_core_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`userId` text,
	`teamId` text,
	`title` text(255),
	`sourceLanguage` text(16),
	`targetLanguage` text(16) NOT NULL,
	`industry` text(100),
	`glossaryId` text,
	`enginePreference` text NOT NULL DEFAULT 'auto',
	`status` text NOT NULL DEFAULT 'queued',
	`currentStage` text NOT NULL DEFAULT 'prepare',
	`progress` integer NOT NULL DEFAULT 0,
	`ocrEnabled` integer NOT NULL DEFAULT 0,
	`priority` integer NOT NULL DEFAULT 0,
	`pageCount` integer NOT NULL DEFAULT 0,
	`segmentCount` integer NOT NULL DEFAULT 0,
	`sourceFileKey` text(600) NOT NULL,
	`sourceFileName` text(255),
	`sourceFileSize` integer NOT NULL DEFAULT 0,
	`sourceFileMime` text(100),
	`outputFileKey` text(600),
	`previewBundleKey` text(600),
	`queueToken` text(200),
	`errorCode` text(100),
	`errorMessage` text(2000),
	`startedAt` integer,
	`completedAt` integer,
	`cancelledAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `pdf_translate_com_core_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teamId`) REFERENCES `pdf_translate_com_core_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`glossaryId`) REFERENCES `pdf_translate_com_cfg_glossaries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_jobs_user_status` ON `pdf_translate_com_core_jobs` (`userId`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_jobs_team_status` ON `pdf_translate_com_core_jobs` (`teamId`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_jobs_stage` ON `pdf_translate_com_core_jobs` (`currentStage`);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_jobs_queue_token` ON `pdf_translate_com_core_jobs` (`queueToken`);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_jobs_created_at` ON `pdf_translate_com_core_jobs` (`createdAt`);
--> statement-breakpoint
CREATE TABLE `pdf_translate_com_core_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`jobId` text NOT NULL,
	`pageNumber` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`dpi` integer,
	`rotation` integer NOT NULL DEFAULT 0,
	`originalAssetKey` text(600),
	`backgroundAssetKey` text(600),
	`textLayerAssetKey` text(600),
	`ocrJsonAssetKey` text(600),
	`checksum` text(128),
	FOREIGN KEY (`jobId`) REFERENCES `pdf_translate_com_core_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_pages_job_page` ON `pdf_translate_com_core_pages` (`jobId`,`pageNumber`);
--> statement-breakpoint
CREATE TABLE `pdf_translate_com_core_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`jobId` text NOT NULL,
	`pageId` text NOT NULL,
	`pageNumber` integer NOT NULL,
	`blockId` text(64) NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL DEFAULT 'text',
	`sourceLocale` text(16),
	`sourceText` text NOT NULL,
	`normalizedSourceText` text,
	`boundingBox` text,
	`metadata` text,
	FOREIGN KEY (`jobId`) REFERENCES `pdf_translate_com_core_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pageId`) REFERENCES `pdf_translate_com_core_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_segments_job` ON `pdf_translate_com_core_segments` (`jobId`);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_segments_page` ON `pdf_translate_com_core_segments` (`pageId`);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_segments_job_block` ON `pdf_translate_com_core_segments` (`jobId`,`blockId`);
--> statement-breakpoint
CREATE TABLE `pdf_translate_com_core_segment_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`jobId` text NOT NULL,
	`segmentId` text NOT NULL,
	`engine` text NOT NULL,
	`targetLocale` text(16) NOT NULL,
	`targetText` text NOT NULL,
	`rawResponse` text,
	`qualityScore` integer,
	`glossaryMatches` text,
	`postEdited` integer NOT NULL DEFAULT 0,
	`reviewedBy` text,
	`reviewedAt` integer,
	FOREIGN KEY (`jobId`) REFERENCES `pdf_translate_com_core_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`segmentId`) REFERENCES `pdf_translate_com_core_segments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewedBy`) REFERENCES `pdf_translate_com_core_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_segment_translations_segment` ON `pdf_translate_com_core_segment_translations` (`segmentId`);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_segment_translations_job` ON `pdf_translate_com_core_segment_translations` (`jobId`);
--> statement-breakpoint
CREATE TABLE `pdf_translate_com_core_job_events` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`jobId` text NOT NULL,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`message` text(2000),
	`meta` text,
	FOREIGN KEY (`jobId`) REFERENCES `pdf_translate_com_core_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_job_events_job` ON `pdf_translate_com_core_job_events` (`jobId`);
--> statement-breakpoint
CREATE INDEX `idx_pdf_translate_com_core_job_events_stage` ON `pdf_translate_com_core_job_events` (`stage`);
