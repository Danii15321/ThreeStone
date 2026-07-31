CREATE TABLE "player_renown" (
	"rated_games" integer DEFAULT 0 NOT NULL,
	"renown" integer DEFAULT 1000 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL,
	CONSTRAINT "player_renown_games_check" CHECK ("player_renown"."rated_games" >= 0),
	CONSTRAINT "player_renown_value_check" CHECK ("player_renown"."renown" >= 0)
);
--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD COLUMN "renown_after" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD COLUMN "renown_before" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD COLUMN "renown_delta" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_renown" ADD CONSTRAINT "player_renown_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD CONSTRAINT "multiplayer_participant_renown_after_check" CHECK ("multiplayer_participant"."renown_after" >= 0);--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD CONSTRAINT "multiplayer_participant_renown_before_check" CHECK ("multiplayer_participant"."renown_before" >= 0);