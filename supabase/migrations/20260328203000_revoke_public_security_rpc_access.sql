BEGIN;

-- Keep sensitive security/observability routines off the public anon surface.
-- These functions are only meant to be used internally by privileged flows.
REVOKE ALL ON FUNCTION public.get_request_header(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_request_ip() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.log_system_event(text, text, text, text, jsonb, jsonb, jsonb, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_super_admin_login(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.register_super_admin_failed_attempt(text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.register_super_admin_failed_attempt(text, text, jsonb) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.log_system_event(text, text, text, text, jsonb, jsonb, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_super_admin_login(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_super_admin_failed_attempt(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_super_admin_failed_attempt(text, text, jsonb) TO service_role;

COMMIT;
