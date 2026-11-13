ALTER TABLE "talent_profiles" ADD COLUMN "showreel_media_id" uuid;--> statement-breakpoint
ALTER TABLE "talent_profiles" ADD CONSTRAINT "talent_profiles_showreel_media_id_media_assets_id_fk" FOREIGN KEY ("showreel_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- The portfolio's layout is now fixed by category, computed on read; nothing about it is stored.
-- Before the section rows go, keep what only they held: the showreel video (a visible section
-- first, then by position; the talent's own video only) and an About section's own text, which
-- becomes the bio when the talent has none.
UPDATE "talent_profiles" tp SET "showreel_media_id" = picked.media_id
FROM (
  SELECT DISTINCT ON (ps.talent_id) ps.talent_id, (ps.config->>'mediaId')::uuid AS media_id
  FROM "portfolio_sections" ps
  JOIN "media_assets" ma
    ON ma.id = (ps.config->>'mediaId')::uuid AND ma.owner_id = ps.talent_id AND ma.kind = 'video'
  WHERE ps.type = 'showreel' AND ps.config->>'mediaId' IS NOT NULL
  ORDER BY ps.talent_id, ps.is_visible DESC, ps.position
) picked
WHERE tp.user_id = picked.talent_id;--> statement-breakpoint
UPDATE "talent_profiles" tp SET "bio" = about.body
FROM (
  SELECT DISTINCT ON (ps.talent_id) ps.talent_id, btrim(ps.config->>'body') AS body
  FROM "portfolio_sections" ps
  WHERE ps.type = 'about' AND coalesce(btrim(ps.config->>'body'), '') <> ''
  ORDER BY ps.talent_id, ps.is_visible DESC, ps.position
) about
WHERE tp.user_id = about.talent_id AND coalesce(btrim(tp.bio), '') = '';--> statement-breakpoint
-- has_showreel now reads the profile's showreel, not a section row.
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
    tp.showreel_media_id IS NOT NULL,
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
DROP TRIGGER IF EXISTS talent_search_sync ON public.talent_profiles;--> statement-breakpoint
CREATE TRIGGER talent_search_sync
  AFTER INSERT OR UPDATE OF status, city_id, rate_visibility, display_name, headline, bio, showreel_media_id
  ON public.talent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_search_sync_profile();--> statement-breakpoint
ALTER TABLE "portfolio_sections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "section_media" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "section_media" CASCADE;--> statement-breakpoint
DROP TABLE "portfolio_sections" CASCADE;--> statement-breakpoint
DROP FUNCTION IF EXISTS public.enforce_portfolio_section_cap();--> statement-breakpoint
-- Refresh every projection once so has_showreel reflects the moved showreels.
SELECT public.refresh_talent_search(user_id) FROM public.talent_profiles;
