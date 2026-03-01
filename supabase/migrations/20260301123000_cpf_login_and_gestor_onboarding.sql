-- Login e onboarding por CPF (gestor) + lookup RPC por CPF.

ALTER TABLE public.tenant_admin_invites
  ADD COLUMN IF NOT EXISTS cpf text;

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
  WHERE tai.token = _token
    AND tai.usado_em IS NULL
    AND tai.expira_em > now()
    AND t.ativo = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.provision_tenant(
  _escola_nome text,
  _subdominio text,
  _plano text DEFAULT 'trial',
  _base_domain text DEFAULT NULL,
  _invite_cpf text DEFAULT NULL,
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
  v_invite_cpf text;
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

  v_invite_cpf := nullif(regexp_replace(coalesce(_invite_cpf, ''), '[^0-9]', '', 'g'), '');
  IF v_invite_cpf IS NOT NULL AND length(v_invite_cpf) <> 11 THEN
    RAISE EXCEPTION 'CPF do convite deve ter 11 dígitos';
  END IF;

  INSERT INTO public.tenant_admin_invites (tenant_id, escola_id, cpf, expira_em, created_by)
  VALUES (
    v_tenant_id,
    v_escola_id,
    v_invite_cpf,
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

CREATE OR REPLACE FUNCTION public.get_login_email_by_cpf(_cpf text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
BEGIN
  IF _cpf IS NULL OR btrim(_cpf) = '' THEN
    RETURN NULL;
  END IF;

  SELECT ub.email
  INTO v_email
  FROM public.usuarios_biblioteca ub
  WHERE regexp_replace(coalesce(ub.cpf, ''), '[^0-9]', '', 'g')
      = regexp_replace(_cpf, '[^0-9]', '', 'g')
    AND ub.user_id IS NOT NULL
  ORDER BY ub.updated_at DESC NULLS LAST, ub.created_at DESC
  LIMIT 1;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_login_email_by_cpf(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_login_email_by_cpf(text) TO anon, authenticated;

