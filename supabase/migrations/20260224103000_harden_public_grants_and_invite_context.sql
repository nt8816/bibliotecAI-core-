-- Security hardening:
-- 1) Replace broad GRANT ALL privileges with minimum required privileges.
-- 2) Ensure invite context exposes bound email so onboarding can enforce it.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;

REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_tenant_invite_context(_token text)
RETURNS TABLE (
  tenant_id uuid,
  escola_id uuid,
  escola_nome text,
  subdominio text,
  email text,
  expira_em timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tai.tenant_id,
    tai.escola_id,
    e.nome AS escola_nome,
    t.subdominio,
    lower(nullif(trim(tai.email), '')) AS email,
    tai.expira_em
  FROM public.tenant_admin_invites tai
  JOIN public.tenants t ON t.id = tai.tenant_id
  JOIN public.escolas e ON e.id = tai.escola_id
  WHERE tai.token = _token
    AND tai.usado_em IS NULL
    AND tai.expira_em > now()
    AND t.ativo = true
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_invite_context(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, text, text, integer) TO authenticated;
