ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_username" text;--> statement-breakpoint
WITH "username_candidates" AS (
  SELECT
    "id",
    LEFT(LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9_.]+', '', 'g')), 24) AS "candidate",
    LEFT(COALESCE(NULLIF(TRIM("name"), ''), 'Player'), 24) AS "display_candidate"
  FROM "user"
),
"username_counts" AS (
  SELECT
    "id",
    "candidate",
    "display_candidate",
    COUNT(*) OVER (PARTITION BY "candidate") AS "candidate_count"
  FROM "username_candidates"
)
UPDATE "user"
SET
  "display_username" = "username_counts"."display_candidate",
  "username" = CASE
    WHEN LENGTH("username_counts"."candidate") >= 3
      AND "username_counts"."candidate_count" = 1
      THEN "username_counts"."candidate"
    ELSE LEFT(
      CASE
        WHEN LENGTH("username_counts"."candidate") >= 3
          THEN "username_counts"."candidate"
        ELSE 'player'
      END,
      17
    ) || '_' || LEFT(MD5("user"."id"), 6)
  END
FROM "username_counts"
WHERE "user"."id" = "username_counts"."id";--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_unique" ON "user" USING btree ("username");
