ALTER TABLE "player_renown" RENAME TO "player_stones";--> statement-breakpoint
ALTER TABLE "multiplayer_participant" RENAME COLUMN "renown_after" TO "stones_after";--> statement-breakpoint
ALTER TABLE "multiplayer_participant" RENAME COLUMN "renown_before" TO "stones_before";--> statement-breakpoint
ALTER TABLE "multiplayer_participant" RENAME COLUMN "renown_delta" TO "stones_delta";--> statement-breakpoint
ALTER TABLE "player_stones" RENAME COLUMN "renown" TO "stones";--> statement-breakpoint
ALTER TABLE "multiplayer_participant" DROP CONSTRAINT "multiplayer_participant_renown_after_check";--> statement-breakpoint
ALTER TABLE "multiplayer_participant" DROP CONSTRAINT "multiplayer_participant_renown_before_check";--> statement-breakpoint
ALTER TABLE "player_stones" DROP CONSTRAINT "player_renown_games_check";--> statement-breakpoint
ALTER TABLE "player_stones" DROP CONSTRAINT "player_renown_value_check";--> statement-breakpoint
ALTER TABLE "player_stones" DROP CONSTRAINT "player_renown_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ALTER COLUMN "stones_after" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ALTER COLUMN "stones_before" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "player_stones" ALTER COLUMN "stones" SET DEFAULT 0;--> statement-breakpoint
UPDATE "multiplayer_participant"
SET
	"stones_after" = "stones_after" - 1000,
	"stones_before" = "stones_before" - 1000;--> statement-breakpoint
UPDATE "player_stones" SET "stones" = "stones" - 1000;--> statement-breakpoint
ALTER TABLE "player_stones" ADD CONSTRAINT "player_stones_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stones" ADD CONSTRAINT "player_stones_games_check" CHECK ("player_stones"."rated_games" >= 0);
