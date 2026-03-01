-- Reparo idempotente para ambientes onde tenant_admin_invites foi removida,
-- mas o histórico de migration já marca a base multitenant como aplicada.

CREATE TABLE IF NOT EXISTS public.tenant_admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  escola_id uuid NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT md5(random()::text || clock_timestamp()::text),
  email text,
  expira_em timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  usado_em timestamptz,
  usado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_admin_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only super admins manage tenant admin invites" ON public.tenant_admin_invites;
CREATE POLICY "Only super admins manage tenant admin invites"
  ON public.tenant_admin_invites
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
