-- Corrige acesso ao contexto de convite de onboarding de tenant.
-- Algumas migrations recriaram a função e perderam grants para anon/authenticated.

CREATE OR REPLACE FUNCTION public.get_tenant_invite_context(_token text)
RETURNS TABLE (
  tenant_id uuid,
  escola_id uuid,
  escola_nome text,
  subdominio text,
  email text,
  cpf text,
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
    nullif(regexp_replace(coalesce(tai.cpf, ''), '[^0-9]', '', 'g'), '') AS cpf,
    tai.expira_em
  FROM public.tenant_admin_invites tai
  JOIN public.tenants t ON t.id = tai.tenant_id
  JOIN public.escolas e ON e.id = tai.escola_id
  WHERE tai.token = trim(coalesce(_token, ''))
    AND tai.usado_em IS NULL
    AND tai.expira_em > now()
    AND t.ativo = true
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_tenant_invite_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_invite_context(text) TO anon, authenticated;
