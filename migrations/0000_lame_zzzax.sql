CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `leaderboard_entry` (
	`x_user_id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`overall` integer NOT NULL,
	`rating_eyes` integer NOT NULL,
	`rating_eyebrows` integer NOT NULL,
	`rating_nose` integer NOT NULL,
	`rating_lips` integer NOT NULL,
	`rating_jawline` integer NOT NULL,
	`rating_chin` integer NOT NULL,
	`rating_cheekbones` integer NOT NULL,
	`rating_forehead` integer NOT NULL,
	`rating_skin` integer NOT NULL,
	`rating_teeth` integer NOT NULL,
	`rating_hair_and_hairline` integer NOT NULL,
	`rating_ears` integer NOT NULL,
	`rating_symmetry` integer NOT NULL,
	`rating_proportions` integer NOT NULL,
	`rating_approachability` integer NOT NULL,
	`rating_trustworthiness` integer NOT NULL,
	`rating_main_character_energy` integer NOT NULL,
	`rating_style_and_grooming` integer NOT NULL,
	`rating_confidence` integer NOT NULL,
	`affinity_k_beauty` integer NOT NULL,
	`affinity_old_hollywood` integer NOT NULL,
	`affinity_bollywood_glamour` integer NOT NULL,
	`affinity_nordic_minimalism` integer NOT NULL,
	`affinity_mediterranean_classical` integer NOT NULL,
	`affinity_nollywood_glamour` integer NOT NULL,
	`affinity_persian_classical` integer NOT NULL,
	`affinity_latin_screen_siren` integer NOT NULL,
	`portrait_key` text,
	`portrait_consent` integer DEFAULT false NOT NULL,
	`portrait_expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leaderboard_entry_overall_idx` ON `leaderboard_entry` (`overall`);--> statement-breakpoint
CREATE INDEX `leaderboard_entry_affinity_k_beauty_idx` ON `leaderboard_entry` (`affinity_k_beauty`);--> statement-breakpoint
CREATE INDEX `leaderboard_entry_affinity_old_hollywood_idx` ON `leaderboard_entry` (`affinity_old_hollywood`);--> statement-breakpoint
CREATE INDEX `leaderboard_entry_affinity_bollywood_glamour_idx` ON `leaderboard_entry` (`affinity_bollywood_glamour`);--> statement-breakpoint
CREATE INDEX `leaderboard_entry_affinity_nordic_minimalism_idx` ON `leaderboard_entry` (`affinity_nordic_minimalism`);--> statement-breakpoint
CREATE INDEX `leaderboard_entry_affinity_mediterranean_classical_idx` ON `leaderboard_entry` (`affinity_mediterranean_classical`);--> statement-breakpoint
CREATE INDEX `leaderboard_entry_affinity_nollywood_glamour_idx` ON `leaderboard_entry` (`affinity_nollywood_glamour`);--> statement-breakpoint
CREATE INDEX `leaderboard_entry_affinity_persian_classical_idx` ON `leaderboard_entry` (`affinity_persian_classical`);--> statement-breakpoint
CREATE INDEX `leaderboard_entry_affinity_latin_screen_siren_idx` ON `leaderboard_entry` (`affinity_latin_screen_siren`);--> statement-breakpoint
CREATE INDEX `leaderboard_entry_portrait_expires_at_idx` ON `leaderboard_entry` (`portrait_expires_at`) WHERE "leaderboard_entry"."portrait_key" is not null;--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `tally` (
	`overall` integer PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`x_username` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);