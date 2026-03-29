BEGIN;

-- Functions are executable by PUBLIC by default in Postgres unless revoked.
-- Revoke from PUBLIC explicitly so anon clients cannot reach these RPCs.
REVOKE ALL ON FUNCTION public.get_request_header(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_request_ip() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_system_event(text, text, text, text, jsonb, jsonb, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_super_admin_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_super_admin_failed_attempt(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_super_admin_failed_attempt(text, text, jsonb) FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
