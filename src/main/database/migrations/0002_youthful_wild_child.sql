CREATE TABLE `transcript_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`transcript_id` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`speaker` text,
	`text` text NOT NULL,
	`confidence` real,
	FOREIGN KEY (`transcript_id`) REFERENCES `transcripts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_transcript_segments_transcript_start` ON `transcript_segments` (`transcript_id`,`start_ms`);--> statement-breakpoint
CREATE TABLE `transcription_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`provider` text NOT NULL,
	`language` text,
	`error` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_transcription_jobs_project` ON `transcription_jobs` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`language` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_transcripts_project` ON `transcripts` (`project_id`);