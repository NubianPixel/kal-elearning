CREATE TABLE `card_states` (
	`item_id` text NOT NULL,
	`card_type` text NOT NULL,
	`ease` real DEFAULT 2.5 NOT NULL,
	`interval_days` real DEFAULT 0 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`due_date` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`last_reviewed_at` text,
	`introduced_at` text,
	PRIMARY KEY(`item_id`, `card_type`)
);
--> statement-breakpoint
CREATE INDEX `idx_card_states_due` ON `card_states` (`due_date`);--> statement-breakpoint
CREATE TABLE `checkpoint_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`unit` integer,
	`overall` real NOT NULL,
	`per_skill_json` text NOT NULL,
	`passed` integer NOT NULL,
	`attempted_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_checkpoint_attempts_unit` ON `checkpoint_attempts` (`unit`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `goal_days` (
	`day` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`card_type` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`quality` integer NOT NULL,
	`time_spent_ms` integer
);
--> statement-breakpoint
CREATE INDEX `idx_review_logs_item` ON `review_logs` (`item_id`,`card_type`,`reviewed_at`);--> statement-breakpoint
CREATE INDEX `idx_review_logs_reviewed_at` ON `review_logs` (`reviewed_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `speaking_ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`rating` text NOT NULL,
	`rated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_speaking_ratings_item` ON `speaking_ratings` (`item_id`,`rated_at`);--> statement-breakpoint
CREATE TABLE `unit_steps` (
	`unit` integer NOT NULL,
	`step` text NOT NULL,
	`completed_at` text NOT NULL,
	PRIMARY KEY(`unit`, `step`)
);
