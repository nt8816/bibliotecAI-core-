-- Clients must not be able to alter arbitrary rate-limit buckets or parameters.
-- All application callers use the service-role client in Edge Functions.
REVOKE ALL ON FUNCTION public.check_ai_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(text, integer, integer) TO service_role;

