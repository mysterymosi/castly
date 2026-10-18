-- REVIEW ONLY — not registered in drizzle/meta/_journal.json. Do not apply until you approve.
--
-- Removes legacy Cloudflare Stream from media_provider after Mux migration.
--
-- Preflight (must return zero rows before applying):
--   SELECT id, owner_id, status FROM media_assets WHERE provider = 'cf_stream';
--
-- If legacy rows exist, decide whether to delete assets, mark failed, or migrate playback elsewhere.

BEGIN;

UPDATE media_assets
SET status = 'failed', updated_at = NOW()
WHERE provider = 'cf_stream';

CREATE TYPE "public"."media_provider_new" AS ENUM('cf_images', 'mux', 'supabase');

ALTER TABLE "media_assets"
  ALTER COLUMN "provider" TYPE "public"."media_provider_new"
  USING ("provider"::text::"public"."media_provider_new");

DROP TYPE "public"."media_provider";

ALTER TYPE "public"."media_provider_new" RENAME TO "media_provider";

COMMIT;
