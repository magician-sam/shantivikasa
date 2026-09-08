CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cloud_commits` (
	`revision` integer PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cloud_commits_id_unique` ON `cloud_commits` (`id`);--> statement-breakpoint
CREATE TABLE `cloud_photos` (
	`hash` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`bytes` blob NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cloud_products` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cloud_sales` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
