CREATE TABLE "active_multiplayer_lease" (
	"expires_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"lease_token_hash" text NOT NULL,
	"room_id" uuid NOT NULL,
	"server_instance_id" text NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL,
	CONSTRAINT "active_multiplayer_lease_expiry_check" CHECK ("active_multiplayer_lease"."expires_at" > "active_multiplayer_lease"."heartbeat_at")
);
--> statement-breakpoint
CREATE TABLE "multiplayer_game" (
	"completed_at" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"game_id" uuid PRIMARY KEY NOT NULL,
	"initial_initiative" text NOT NULL,
	"protocol_version" integer NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"rounds_played" integer NOT NULL,
	"rules_version" text NOT NULL,
	"seed" bigint NOT NULL,
	"terminal_reason" text NOT NULL,
	"winner" text NOT NULL,
	CONSTRAINT "multiplayer_game_initial_initiative_check" CHECK ("multiplayer_game"."initial_initiative" in ('player-one', 'player-two')),
	CONSTRAINT "multiplayer_game_protocol_version_check" CHECK ("multiplayer_game"."protocol_version" > 0),
	CONSTRAINT "multiplayer_game_rounds_check" CHECK ("multiplayer_game"."rounds_played" between 0 and 10000),
	CONSTRAINT "multiplayer_game_terminal_reason_check" CHECK ("multiplayer_game"."terminal_reason" in ('reserve-empty', 'hidden-choice-timeout', 'prediction-timeout', 'abandon', 'disconnect')),
	CONSTRAINT "multiplayer_game_winner_check" CHECK ("multiplayer_game"."winner" in ('player-one', 'player-two'))
);
--> statement-breakpoint
CREATE TABLE "multiplayer_participant" (
	"final_reserve" integer NOT NULL,
	"game_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"seat" text NOT NULL,
	"user_id" text,
	CONSTRAINT "multiplayer_participant_game_id_seat_pk" PRIMARY KEY("game_id","seat"),
	CONSTRAINT "multiplayer_participant_final_reserve_check" CHECK ("multiplayer_participant"."final_reserve" between 0 and 3),
	CONSTRAINT "multiplayer_participant_outcome_check" CHECK ("multiplayer_participant"."outcome" in ('win', 'loss')),
	CONSTRAINT "multiplayer_participant_seat_check" CHECK ("multiplayer_participant"."seat" in ('player-one', 'player-two'))
);
--> statement-breakpoint
CREATE TABLE "multiplayer_round" (
	"choice_one" integer NOT NULL,
	"choice_two" integer NOT NULL,
	"game_id" uuid NOT NULL,
	"initiative" text NOT NULL,
	"prediction_one" integer NOT NULL,
	"prediction_two" integer NOT NULL,
	"reserve_one_after" integer NOT NULL,
	"reserve_two_after" integer NOT NULL,
	"round_number" integer NOT NULL,
	"total" integer NOT NULL,
	"winner" text,
	CONSTRAINT "multiplayer_round_game_id_round_number_pk" PRIMARY KEY("game_id","round_number"),
	CONSTRAINT "multiplayer_round_number_check" CHECK ("multiplayer_round"."round_number" > 0),
	CONSTRAINT "multiplayer_round_choice_one_check" CHECK ("multiplayer_round"."choice_one" between 0 and 3),
	CONSTRAINT "multiplayer_round_choice_two_check" CHECK ("multiplayer_round"."choice_two" between 0 and 3),
	CONSTRAINT "multiplayer_round_prediction_one_check" CHECK ("multiplayer_round"."prediction_one" between 0 and 6),
	CONSTRAINT "multiplayer_round_prediction_two_check" CHECK ("multiplayer_round"."prediction_two" between 0 and 6),
	CONSTRAINT "multiplayer_round_predictions_distinct_check" CHECK ("multiplayer_round"."prediction_one" <> "multiplayer_round"."prediction_two"),
	CONSTRAINT "multiplayer_round_total_check" CHECK ("multiplayer_round"."total" = "multiplayer_round"."choice_one" + "multiplayer_round"."choice_two"),
	CONSTRAINT "multiplayer_round_initiative_check" CHECK ("multiplayer_round"."initiative" in ('player-one', 'player-two')),
	CONSTRAINT "multiplayer_round_winner_check" CHECK ("multiplayer_round"."winner" is null or "multiplayer_round"."winner" in ('player-one', 'player-two')),
	CONSTRAINT "multiplayer_round_reserve_one_check" CHECK ("multiplayer_round"."reserve_one_after" between 0 and 3),
	CONSTRAINT "multiplayer_round_reserve_two_check" CHECK ("multiplayer_round"."reserve_two_after" between 0 and 3)
);
--> statement-breakpoint
ALTER TABLE "active_multiplayer_lease" ADD CONSTRAINT "active_multiplayer_lease_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD CONSTRAINT "multiplayer_participant_game_id_multiplayer_game_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."multiplayer_game"("game_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multiplayer_participant" ADD CONSTRAINT "multiplayer_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multiplayer_round" ADD CONSTRAINT "multiplayer_round_game_id_multiplayer_game_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."multiplayer_game"("game_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "active_multiplayer_lease_expiry_idx" ON "active_multiplayer_lease" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "active_multiplayer_lease_room_idx" ON "active_multiplayer_lease" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "multiplayer_game_completed_idx" ON "multiplayer_game" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "multiplayer_participant_user_completed_idx" ON "multiplayer_participant" USING btree ("user_id","game_id");