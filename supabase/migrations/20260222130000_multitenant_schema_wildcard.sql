-- Multi-tenant foundation (schema-per-tenant + wildcard host resolution + admin onboarding)

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin')
$$;

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id uuid UNIQUE REFERENCES public.escolas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  subdominio text NOT NULL UNIQUE,
  schema_name text NOT NULL UNIQUE,
  plano text NOT NULL DEFAULT 'trial',
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_subdominio_format CHECK (subdominio ~ '^[a-z0-9-]{3,40}$'),
  CONSTRAINT tenants_schema_format CHECK (schema_name ~ '^tenant_[a-z0-9_]{3,63}$')
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenants readable by everyone" ON public.tenants;
CREATE POLICY "Tenants readable by everyone"
  ON public.tenants
  FOR SELECT
  USING (ativo = true);

DROP POLICY IF EXISTS "Only super admins insert tenants" ON public.tenants;
CREATE POLICY "Only super admins insert tenants"
  ON public.tenants
  FOR INSERT
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Only super admins update tenants" ON public.tenants;
CREATE POLICY "Only super admins update tenants"
  ON public.tenants
  FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Only super admins delete tenants" ON public.tenants;
CREATE POLICY "Only super admins delete tenants"
  ON public.tenants
  FOR DELETE
  USING (public.is_super_admin());

DROP TRIGGER IF EXISTS update_tenants_updated_at ON public.tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.escolas
  ADD COLUMN IF NOT EXISTS subdominio text UNIQUE,
  ADD COLUMN IF NOT EXISTS tenant_id uuid UNIQUE REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.tenant_admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  escola_id uuid NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
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

CREATE OR REPLACE FUNCTION public.normalize_subdominio(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(trim(coalesce(_value, ''))), '[^a-z0-9-]', '-', 'g')
$$;

CREATE OR REPLACE FUNCTION public.schema_from_subdominio(_subdominio text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'tenant_' || regexp_replace(public.normalize_subdominio(_subdominio), '-', '_', 'g')
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_invite_context(_token text)
RETURNS TABLE (
  tenant_id uuid,
  escola_id uuid,
  escola_nome text,
  subdominio text,
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

CREATE OR REPLACE FUNCTION public.provision_tenant(
  _escola_nome text,
  _subdominio text,
  _plano text DEFAULT 'trial',
  _base_domain text DEFAULT NULL,
  _invite_email text DEFAULT NULL,
  _invite_expires_hours integer DEFAULT 72
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subdominio text;
  v_schema text;
  v_escola_id uuid;
  v_tenant_id uuid;
  v_invite_token text;
  v_onboarding_url text;
  v_reserved text[] := ARRAY['www', 'admin', 'api', 'app', 'assets', 'cdn', 'mail'];
  v_tables text[] := ARRAY[
    'usuarios_biblioteca',
    'user_roles',
    'livros',
    'emprestimos',
    'salas_cursos',
    'tokens_convite',
    'sugestoes_livros',
    'atividades_leitura',
    'atividades_entregas',
    'comunidade_posts',
    'comunidade_curtidas',
    'audiobooks_biblioteca',
    'aluno_audiobooks',
    'avaliacoes_livros',
    'lista_desejos',
    'preferencias_aluno',
    'solicitacoes_emprestimo'
  ];
  v_table_name text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Somente super_admin pode provisionar tenants';
  END IF;

  IF coalesce(trim(_escola_nome), '') = '' THEN
    RAISE EXCEPTION 'Nome da escola é obrigatório';
  END IF;

  v_subdominio := public.normalize_subdominio(_subdominio);
  IF v_subdominio !~ '^[a-z0-9-]{3,40}$' THEN
    RAISE EXCEPTION 'Subdomínio inválido. Use apenas letras, números e hífen (3-40 chars).';
  END IF;

  IF v_subdominio = ANY (v_reserved) THEN
    RAISE EXCEPTION 'Subdomínio reservado: %', v_subdominio;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE subdominio = v_subdominio) THEN
    RAISE EXCEPTION 'Subdomínio já está em uso';
  END IF;

  v_schema := public.schema_from_subdominio(v_subdominio);

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon, authenticated, service_role', v_schema);

  FOREACH v_table_name IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = v_table_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I.%I (LIKE public.%I INCLUDING ALL)',
        v_schema,
        v_table_name,
        v_table_name
      );
    END IF;
  END LOOP;

  INSERT INTO public.escolas (nome, subdominio)
  VALUES (trim(_escola_nome), v_subdominio)
  RETURNING id INTO v_escola_id;

  INSERT INTO public.tenants (escola_id, nome, subdominio, schema_name, plano, created_by)
  VALUES (v_escola_id, trim(_escola_nome), v_subdominio, v_schema, coalesce(nullif(trim(_plano), ''), 'trial'), auth.uid())
  RETURNING id INTO v_tenant_id;

  UPDATE public.escolas
  SET tenant_id = v_tenant_id
  WHERE id = v_escola_id;

  INSERT INTO public.tenant_admin_invites (tenant_id, escola_id, email, expira_em, created_by)
  VALUES (
    v_tenant_id,
    v_escola_id,
    nullif(lower(trim(coalesce(_invite_email, ''))), ''),
    now() + (greatest(coalesce(_invite_expires_hours, 72), 1)::text || ' hours')::interval,
    auth.uid()
  )
  RETURNING token INTO v_invite_token;

  IF _base_domain IS NOT NULL AND trim(_base_domain) <> '' THEN
    v_onboarding_url := format('https://%s.%s/onboarding/%s', v_subdominio, trim(_base_domain), v_invite_token);
  ELSE
    v_onboarding_url := format('/onboarding/%s?tenant=%s', v_invite_token, v_subdominio);
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'escola_id', v_escola_id,
    'escola_nome', trim(_escola_nome),
    'subdominio', v_subdominio,
    'schema_name', v_schema,
    'plano', coalesce(nullif(trim(_plano), ''), 'trial'),
    'invite_token', v_invite_token,
    'onboarding_url', v_onboarding_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, text, text, integer) TO authenticated;
