CREATE TABLE "talent_photos" (
	"talent_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "talent_photos_talent_id_media_id_pk" PRIMARY KEY("talent_id","media_id")
);
--> statement-breakpoint
ALTER TABLE "talent_photos" ADD CONSTRAINT "talent_photos_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_photos" ADD CONSTRAINT "talent_photos_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "talent_photos_talent_position_idx" ON "talent_photos" USING btree ("talent_id","position");--> statement-breakpoint
CREATE INDEX "talent_photos_media_id_idx" ON "talent_photos" USING btree ("media_id");--> statement-breakpoint
ALTER TABLE "talent_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Photos replace the gallery section. Each talent's photos, in order: the card lead, then hero
-- images, then gallery photos by section position and array order. Only the talent's own images
-- that did not fail moderation or processing; duplicates keep their first place; six at most.
INSERT INTO "talent_photos" ("talent_id", "media_id", "position")
SELECT talent_id, media_id, (rn - 1)::int
FROM (
  SELECT d.talent_id, d.media_id, row_number() OVER (PARTITION BY d.talent_id ORDER BY d.first_rank) AS rn
  FROM (
    SELECT c.talent_id, c.media_id, min(c.rank) AS first_rank
    FROM (
      SELECT tp.user_id AS talent_id, (tp.card_config->>'leadMediaId')::uuid AS media_id, 0::bigint AS rank
      FROM "talent_profiles" tp
      WHERE tp.card_config->>'leadMediaId' IS NOT NULL
      UNION ALL
      SELECT ps.talent_id, (ps.config->>'mediaId')::uuid, 1000 + ps.position
      FROM "portfolio_sections" ps
      WHERE ps.type = 'hero' AND ps.config->>'mediaId' IS NOT NULL
      UNION ALL
      SELECT ps.talent_id, m.value::uuid, 100000 + ps.position * 100 + m.ord
      FROM "portfolio_sections" ps,
        jsonb_array_elements_text(ps.config->'mediaIds') WITH ORDINALITY AS m(value, ord)
      WHERE ps.type = 'gallery' AND jsonb_typeof(ps.config->'mediaIds') = 'array'
    ) c
    JOIN "media_assets" ma
      ON ma.id = c.media_id
      AND ma.owner_id = c.talent_id
      AND ma.kind = 'image'
      AND ma.status NOT IN ('failed', 'quarantined')
    GROUP BY c.talent_id, c.media_id
  ) d
) ranked
WHERE rn <= 6;--> statement-breakpoint
DELETE FROM "portfolio_sections" WHERE "type" = 'gallery';
