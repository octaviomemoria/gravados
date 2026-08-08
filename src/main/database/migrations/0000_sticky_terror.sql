CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`started_at` text,
	`ended_at` text,
	`duration_ms` integer,
	`status` text NOT NULL,
	`root_path` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `idx_projects_created_at` ON `projects` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_projects_status` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`position` integer NOT NULL,
	`start_offset_ms` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tracks_project_id` ON `tracks` (`project_id`);--> statement-breakpoint
CREATE TABLE `segments` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`seq_index` integer NOT NULL,
	`relative_path` text NOT NULL,
	`started_at_ms` integer NOT NULL,
	`ended_at_ms` integer,
	`duration_ms` integer,
	`byte_size` integer DEFAULT 0 NOT NULL,
	`mime_type` text NOT NULL,
	`finalized` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_segments_track_seq` ON `segments` (`track_id`,`seq_index`);--> statement-breakpoint
CREATE TABLE `markers` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`timestamp_ms` integer NOT NULL,
	`title` text,
	`note` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_markers_project_timestamp` ON `markers` (`project_id`,`timestamp_ms`);--> statement-breakpoint
CREATE TABLE `edit_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_edit_projects_project_id` ON `edit_projects` (`project_id`);--> statement-breakpoint
CREATE TABLE `edit_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`edit_project_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`start_ms` integer,
	`end_ms` integer,
	`track_id` text,
	`payload_json` text NOT NULL,
	FOREIGN KEY (`edit_project_id`) REFERENCES `edit_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_edit_operations_project_sequence` ON `edit_operations` (`edit_project_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `export_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`edit_project_id` text NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`output_path` text,
	`error` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`edit_project_id`) REFERENCES `edit_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_export_jobs_status` ON `export_jobs` (`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL
);
