CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`allow_secrets` integer DEFAULT false NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_hash_uq` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_user_name_uq` ON `api_tokens` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author_user_id` text,
	`author_source` text NOT NULL,
	`body` text NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `comments_task_idx` ON `comments` (`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`service` text NOT NULL,
	`url` text,
	`username` text,
	`notes` text DEFAULT '' NOT NULL,
	`secret_enc` text,
	`share_with_claude` integer DEFAULT false NOT NULL,
	`last_accessed_at` integer,
	`last_accessed_source` text,
	`access_count` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_accounts_project_idx` ON `project_accounts` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_links_project_idx` ON `project_links` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`github_login` text NOT NULL,
	`user_id` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`invited_at` integer NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_members_project_login_uq` ON `project_members` (`project_id`,lower("github_login"));--> statement-breakpoint
CREATE INDEX `project_members_user_idx` ON `project_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'idea' NOT NULL,
	`client` text,
	`color` text,
	`is_inbox` integer DEFAULT false NOT NULL,
	`next_task_number` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_uq` ON `projects` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_key_uq` ON `projects` (`key`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`token` text NOT NULL,
	`label` text,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_token_uq` ON `share_links` (`token`);--> statement-breakpoint
CREATE INDEX `share_links_project_idx` ON `share_links` (`project_id`);--> statement-breakpoint
CREATE TABLE `task_checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`done_at` integer,
	`done_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_task_pos_idx` ON `task_checklist_items` (`task_id`,`position`);--> statement-breakpoint
CREATE TABLE `task_links` (
	`id` text PRIMARY KEY NOT NULL,
	`from_task_id` text NOT NULL,
	`to_task_id` text NOT NULL,
	`type` text DEFAULT 'blocks' NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`from_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "task_links_no_self" CHECK("task_links"."from_task_id" <> "task_links"."to_task_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_links_uq` ON `task_links` (`from_task_id`,`to_task_id`,`type`);--> statement-breakpoint
CREATE INDEX `task_links_to_idx` ON `task_links` (`to_task_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`type` text DEFAULT 'feature' NOT NULL,
	`size` text,
	`executor` text DEFAULT 'ai' NOT NULL,
	`assignee_kind` text DEFAULT 'none' NOT NULL,
	`assignee_user_id` text,
	`assignee_external` text,
	`due_date` text,
	`blocker_who` text,
	`blocker_what` text,
	`blocker_since` text,
	`position` real DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_project_number_uq` ON `tasks` (`project_id`,`number`);--> statement-breakpoint
CREATE INDEX `tasks_project_status_pos_idx` ON `tasks` (`project_id`,`status`,`position`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_updated_idx` ON `tasks` (`updated_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`github_id` integer NOT NULL,
	`github_login` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`email` text,
	`role` text DEFAULT 'member' NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_github_id_uq` ON `users` (`github_id`);--> statement-breakpoint
CREATE INDEX `users_login_idx` ON `users` (lower("github_login"));