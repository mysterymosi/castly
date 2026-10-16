-- Default-deny for the Data API roles.
-- RLS is already enabled with no policies (0000). SELECT stays so a query
-- returns zero rows instead of depending on a policy. Writes are revoked.
--
-- Realtime (M6): grant `authenticated` SELECT on `messages` and
-- `conversation_participants` only, plus a membership policy. Those tables
-- do not exist yet — do not grant them here.
-- Direct-to-storage uploads use signed URLs from the API, not table grants.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;--> statement-breakpoint
GRANT CONNECT ON DATABASE postgres TO castly_api;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO castly_api;--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA public TO castly_api;--> statement-breakpoint
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO castly_api;--> statement-breakpoint
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO castly_api;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO castly_api;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO castly_api;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON ROUTINES TO castly_api;
