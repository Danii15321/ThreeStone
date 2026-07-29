ALTER TABLE "player_profile" DROP CONSTRAINT "player_profile_nickname_check";--> statement-breakpoint
ALTER TABLE "player_profile" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_profile" ADD CONSTRAINT "player_profile_version_check" CHECK ("player_profile"."version" > 0);--> statement-breakpoint
ALTER TABLE "player_profile" ADD CONSTRAINT "player_profile_nickname_check" CHECK (char_length("player_profile"."nickname") > 0);