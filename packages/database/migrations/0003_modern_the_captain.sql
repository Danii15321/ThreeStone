ALTER TABLE "player_profile" ADD COLUMN "avatar_data" text;--> statement-breakpoint
ALTER TABLE "player_profile" ADD COLUMN "avatar_media_type" text;--> statement-breakpoint
ALTER TABLE "player_profile" ADD COLUMN "bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "player_profile" ADD CONSTRAINT "player_profile_bio_check" CHECK (char_length("player_profile"."bio") <= 280);--> statement-breakpoint
ALTER TABLE "player_profile" ADD CONSTRAINT "player_profile_avatar_pair_check" CHECK (("player_profile"."avatar_data" is null) = ("player_profile"."avatar_media_type" is null));--> statement-breakpoint
ALTER TABLE "player_profile" ADD CONSTRAINT "player_profile_avatar_media_type_check" CHECK ("player_profile"."avatar_media_type" is null or "player_profile"."avatar_media_type" in ('image/jpeg', 'image/png', 'image/webp'));