CREATE TABLE "account" (
	"access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"account_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"id_token" text,
	"password" text,
	"provider_id" text NOT NULL,
	"refresh_token" text,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_participant" (
	"final_reserve" integer NOT NULL,
	"game_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"seat" text NOT NULL,
	"user_id" text,
	CONSTRAINT "game_participant_game_id_seat_pk" PRIMARY KEY("game_id","seat"),
	CONSTRAINT "game_participant_final_reserve_check" CHECK ("game_participant"."final_reserve" between 0 and 3),
	CONSTRAINT "game_participant_outcome_check" CHECK ("game_participant"."outcome" in ('win', 'loss')),
	CONSTRAINT "game_participant_seat_check" CHECK ("game_participant"."seat" in ('human', 'ai'))
);
--> statement-breakpoint
CREATE TABLE "game_record" (
	"completed_at" timestamp with time zone NOT NULL,
	"difficulty" text NOT NULL,
	"fingerprint" text NOT NULL,
	"game_id" uuid PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'solo' NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"rounds_played" integer NOT NULL,
	"rules_version" text NOT NULL,
	"source" text DEFAULT 'solo-client' NOT NULL,
	"terminal_payload" jsonb NOT NULL,
	"user_id" text NOT NULL,
	"winner" text NOT NULL,
	CONSTRAINT "game_record_difficulty_check" CHECK ("game_record"."difficulty" in ('easy', 'standard', 'hard')),
	CONSTRAINT "game_record_mode_check" CHECK ("game_record"."mode" = 'solo'),
	CONSTRAINT "game_record_rounds_check" CHECK ("game_record"."rounds_played" between 1 and 10000),
	CONSTRAINT "game_record_source_check" CHECK ("game_record"."source" = 'solo-client'),
	CONSTRAINT "game_record_winner_check" CHECK ("game_record"."winner" in ('human', 'ai'))
);
--> statement-breakpoint
CREATE TABLE "player_preferences" (
	"difficulty" text DEFAULT 'standard' NOT NULL,
	"high_contrast" boolean DEFAULT false NOT NULL,
	"motion" text DEFAULT 'system' NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"sound_volume" real DEFAULT 0.8 NOT NULL,
	"tutorial_completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL,
	CONSTRAINT "player_preferences_difficulty_check" CHECK ("player_preferences"."difficulty" in ('easy', 'standard', 'hard')),
	CONSTRAINT "player_preferences_motion_check" CHECK ("player_preferences"."motion" in ('system', 'reduce', 'no-preference')),
	CONSTRAINT "player_preferences_sound_volume_check" CHECK ("player_preferences"."sound_volume" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "player_profile" (
	"created_at" timestamp with time zone NOT NULL,
	"nickname" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL,
	CONSTRAINT "player_profile_nickname_check" CHECK (char_length("player_profile"."nickname") between 1 and 96)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"ip_address" text,
	"token" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"created_at" timestamp with time zone NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"image" text,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"created_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"updated_at" timestamp with time zone,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participant" ADD CONSTRAINT "game_participant_game_id_game_record_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game_record"("game_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participant" ADD CONSTRAINT "game_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_record" ADD CONSTRAINT "game_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_preferences" ADD CONSTRAINT "player_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_profile" ADD CONSTRAINT "player_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "game_participant_user_id_idx" ON "game_participant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "game_record_user_completed_idx" ON "game_record" USING btree ("user_id","completed_at");--> statement-breakpoint
CREATE INDEX "game_record_user_winner_idx" ON "game_record" USING btree ("user_id","winner");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_unique" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");