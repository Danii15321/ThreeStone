ALTER TABLE "multiplayer_game" ADD COLUMN "pair_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "multiplayer_game" ADD COLUMN "rated" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD COLUMN "coeur_de_pierre" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD COLUMN "main_de_pierre_occurrences" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD COLUMN "oeil_en_pierre" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD COLUMN "stones_base_delta" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD COLUMN "stones_bonus" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "multiplayer_participant" SET "stones_base_delta" = "stones_delta";--> statement-breakpoint
CREATE INDEX "multiplayer_game_pair_rated_completed_idx" ON "multiplayer_game" USING btree ("pair_key","rated","completed_at");--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD CONSTRAINT "multiplayer_participant_main_de_pierre_check" CHECK ("multiplayer_participant"."main_de_pierre_occurrences" between 0 and 4);--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD CONSTRAINT "multiplayer_participant_stones_bonus_check" CHECK ("multiplayer_participant"."stones_bonus" >= 0);
