CREATE TABLE IF NOT EXISTS public.auth_session_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_subdomain text NOT NULL,
  target_path text NOT NULL DEFAULT '/dashboard',
  session_payload jsonb NOT NULL,
  origin_ip text,
  user_agent text,
  created_from_origin text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_session_handoffs_user_id_idx
  ON public.auth_session_handoffs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_session_handoffs_expires_at_idx
  ON public.auth_session_handoffs (expires_at);

ALTER TABLE public.auth_session_handoffs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.auth_session_handoffs FROM PUBLIC;
REVOKE ALL ON public.auth_session_handoffs FROM anon;
REVOKE ALL ON public.auth_session_handoffs FROM authenticated;
