CREATE TABLE "talent_search" (
	"talent_id" uuid PRIMARY KEY NOT NULL,
	"status" "talent_profile_status" NOT NULL,
	"city_id" uuid,
	"region" text,
	"country" text,
	"category_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"skill_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"language_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"accent_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"age_min" integer,
	"age_max" integer,
	"height_cm" integer,
	"gender" text,
	"complexion" text,
	"rate_day_min" numeric(12, 2),
	"rate_day_max" numeric(12, 2),
	"rate_visibility" "rate_visibility" NOT NULL,
	"has_showreel" boolean DEFAULT false NOT NULL,
	"credit_count" integer DEFAULT 0 NOT NULL,
	"verification_tier" text DEFAULT 'none' NOT NULL,
	"quality_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"freshness_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"responsiveness_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"completeness_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_tsv" "tsvector" DEFAULT ''::tsvector NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "country" text DEFAULT 'NG' NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "talent_search" ADD CONSTRAINT "talent_search_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "talent_search_category_ids_gin" ON "talent_search" USING gin ("category_ids");--> statement-breakpoint
CREATE INDEX "talent_search_skill_ids_gin" ON "talent_search" USING gin ("skill_ids");--> statement-breakpoint
CREATE INDEX "talent_search_language_ids_gin" ON "talent_search" USING gin ("language_ids");--> statement-breakpoint
CREATE INDEX "talent_search_accent_ids_gin" ON "talent_search" USING gin ("accent_ids");--> statement-breakpoint
CREATE INDEX "talent_search_attrs_gin" ON "talent_search" USING gin ("attrs");--> statement-breakpoint
CREATE INDEX "talent_search_tsv_gin" ON "talent_search" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "talent_search_status_geo_idx" ON "talent_search" USING btree ("status","country","city_id");--> statement-breakpoint
CREATE INDEX "talent_search_live_idx" ON "talent_search" USING btree ("city_id","quality_score" DESC NULLS LAST) WHERE "talent_search"."status" = 'live';--> statement-breakpoint
UPDATE "cities" SET "region" = 'south-west' WHERE "slug" = 'lagos' AND "region" IS NULL;--> statement-breakpoint
UPDATE "cities" SET "region" = 'north-central' WHERE "slug" = 'abuja' AND "region" IS NULL;--> statement-breakpoint
ALTER TABLE "talent_search" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Recomputes every projection column for one talent from the source tables.
-- Score columns are left alone: the `talent.search-scores` job owns them.
-- The NO KEY UPDATE lock on the profile serialises concurrent refreshes for one
-- talent, so a later statement re-reads committed rows instead of upserting a
-- stale snapshot. It does not conflict with the KEY SHARE locks FK checks take.
-- Text search uses the 'simple' config: names and Nigerian languages do not stem
-- well in 'english'. Queries must use websearch_to_tsquery('simple', …).
CREATE OR REPLACE FUNCTION public.refresh_talent_search(p_talent_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF p_talent_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM 1 FROM public.talent_profiles WHERE user_id = p_talent_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    DELETE FROM public.talent_search WHERE talent_id = p_talent_id;
    RETURN;
  END IF;

  INSERT INTO public.talent_search AS ts (
    talent_id,
    status,
    city_id,
    region,
    country,
    category_ids,
    skill_ids,
    language_ids,
    accent_ids,
    rate_day_min,
    rate_day_max,
    rate_visibility,
    has_showreel,
    credit_count,
    search_tsv,
    updated_at
  )
  SELECT
    tp.user_id,
    tp.status,
    tp.city_id,
    c.region,
    c.country,
    COALESCE(cat.ids, ARRAY[]::uuid[]),
    COALESCE(sk.ids, ARRAY[]::uuid[]),
    COALESCE(lang.ids, ARRAY[]::uuid[]),
    COALESCE(acc.ids, ARRAY[]::uuid[]),
    CASE WHEN tp.rate_visibility = 'hidden' THEN NULL ELSE r.amount_min END,
    CASE WHEN tp.rate_visibility = 'hidden' THEN NULL ELSE r.amount_max END,
    tp.rate_visibility,
    EXISTS (
      SELECT 1 FROM public.portfolio_sections ps
      WHERE ps.talent_id = tp.user_id AND ps.type = 'showreel' AND ps.is_visible
    ),
    (SELECT count(*)::int FROM public.credits cr WHERE cr.talent_id = tp.user_id),
    setweight(to_tsvector('simple', coalesce(tp.display_name, '')), 'A')
      || setweight(
        to_tsvector(
          'simple',
          concat_ws(' ', tp.headline, cat.names, sk.names)
        ),
        'B'
      )
      || setweight(
        to_tsvector('simple', concat_ws(' ', tp.bio, c.name, lang.names)),
        'C'
      ),
    now()
  FROM public.talent_profiles tp
  LEFT JOIN public.cities c ON c.id = tp.city_id
  LEFT JOIN public.talent_rates r ON r.talent_id = tp.user_id AND r.kind = 'day'
  LEFT JOIN LATERAL (
    SELECT array_agg(x.category_id ORDER BY x.category_id) AS ids,
           string_agg(t.name, ' ') AS names
    FROM public.talent_categories x
    JOIN public.categories t ON t.id = x.category_id
    WHERE x.talent_id = tp.user_id
  ) cat ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(x.skill_id ORDER BY x.skill_id) AS ids,
           string_agg(t.name, ' ') AS names
    FROM public.talent_skills x
    JOIN public.skills t ON t.id = x.skill_id
    WHERE x.talent_id = tp.user_id
  ) sk ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(x.language_id ORDER BY x.language_id) AS ids,
           string_agg(t.name, ' ') AS names
    FROM public.talent_languages x
    JOIN public.languages t ON t.id = x.language_id
    WHERE x.talent_id = tp.user_id
  ) lang ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(x.accent_id ORDER BY x.accent_id) AS ids
    FROM public.talent_accents x
    WHERE x.talent_id = tp.user_id
  ) acc ON true
  WHERE tp.user_id = p_talent_id
  ON CONFLICT (talent_id) DO UPDATE SET
    status = EXCLUDED.status,
    city_id = EXCLUDED.city_id,
    region = EXCLUDED.region,
    country = EXCLUDED.country,
    category_ids = EXCLUDED.category_ids,
    skill_ids = EXCLUDED.skill_ids,
    language_ids = EXCLUDED.language_ids,
    accent_ids = EXCLUDED.accent_ids,
    rate_day_min = EXCLUDED.rate_day_min,
    rate_day_max = EXCLUDED.rate_day_max,
    rate_visibility = EXCLUDED.rate_visibility,
    has_showreel = EXCLUDED.has_showreel,
    credit_count = EXCLUDED.credit_count,
    search_tsv = EXCLUDED.search_tsv,
    updated_at = EXCLUDED.updated_at;
END;
$fn$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.talent_search_sync_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  PERFORM public.refresh_talent_search(NEW.user_id);
  RETURN NULL;
END;
$fn$;--> statement-breakpoint
-- Shared by every child table keyed on talent_id. An UPDATE that moves a row
-- between talents refreshes both.
CREATE OR REPLACE FUNCTION public.talent_search_sync_child()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.refresh_talent_search(OLD.talent_id);
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.talent_id IS DISTINCT FROM OLD.talent_id) THEN
    PERFORM public.refresh_talent_search(NEW.talent_id);
  END IF;
  RETURN NULL;
END;
$fn$;--> statement-breakpoint
-- City country/region feed geo scope. Rare admin edit, so a per-city loop is fine.
CREATE OR REPLACE FUNCTION public.talent_search_sync_city()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  affected uuid;
BEGIN
  FOR affected IN
    SELECT user_id FROM public.talent_profiles WHERE city_id = NEW.id
  LOOP
    PERFORM public.refresh_talent_search(affected);
  END LOOP;
  RETURN NULL;
END;
$fn$;--> statement-breakpoint
CREATE TRIGGER talent_search_sync
  AFTER INSERT OR UPDATE OF status, city_id, rate_visibility, display_name, headline, bio
  ON public.talent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_search_sync_profile();--> statement-breakpoint
CREATE TRIGGER talent_search_sync
  AFTER INSERT OR DELETE OR UPDATE OF talent_id, category_id ON public.talent_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_search_sync_child();--> statement-breakpoint
CREATE TRIGGER talent_search_sync
  AFTER INSERT OR DELETE OR UPDATE OF talent_id, skill_id ON public.talent_skills
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_search_sync_child();--> statement-breakpoint
CREATE TRIGGER talent_search_sync
  AFTER INSERT OR DELETE OR UPDATE OF talent_id, language_id ON public.talent_languages
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_search_sync_child();--> statement-breakpoint
CREATE TRIGGER talent_search_sync
  AFTER INSERT OR DELETE OR UPDATE OF talent_id, accent_id ON public.talent_accents
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_search_sync_child();--> statement-breakpoint
CREATE TRIGGER talent_search_sync
  AFTER INSERT OR DELETE OR UPDATE ON public.talent_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_search_sync_child();--> statement-breakpoint
CREATE TRIGGER talent_search_sync
  AFTER INSERT OR DELETE OR UPDATE OF talent_id, type, is_visible ON public.portfolio_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_search_sync_child();--> statement-breakpoint
CREATE TRIGGER talent_search_sync
  AFTER INSERT OR DELETE OR UPDATE OF talent_id ON public.credits
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_search_sync_child();--> statement-breakpoint
CREATE TRIGGER talent_search_sync
  AFTER UPDATE OF name, country, region ON public.cities
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_search_sync_city();--> statement-breakpoint
REVOKE ALL ON FUNCTION public.refresh_talent_search(uuid) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.talent_search_sync_profile() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.talent_search_sync_child() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.talent_search_sync_city() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.refresh_talent_search(uuid) TO castly_api;--> statement-breakpoint
SELECT public.refresh_talent_search(user_id) FROM public.talent_profiles;--> statement-breakpoint
UPDATE public.talent_search ts
SET quality_score = tp.quality_score,
    completeness_score = tp.completeness_score,
    responsiveness_score = tp.responsiveness_score
FROM public.talent_profiles tp
WHERE tp.user_id = ts.talent_id;
