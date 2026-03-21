BEGIN;

CREATE TABLE IF NOT EXISTS public.super_admin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  nome text,
  email text NOT NULL UNIQUE,
  cpf text UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  bloqueado boolean NOT NULL DEFAULT false,
  tentativas_falhas integer NOT NULL DEFAULT 0,
  ultima_tentativa_em timestamptz,
  ultimo_login_em timestamptz,
  bloqueado_em timestamptz,
  desbloqueado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  desbloqueado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT super_admin_accounts_failed_attempts_check CHECK (tentativas_falhas >= 0)
);

CREATE INDEX IF NOT EXISTS super_admin_accounts_email_idx ON public.super_admin_accounts (lower(email));
CREATE INDEX IF NOT EXISTS super_admin_accounts_cpf_idx ON public.super_admin_accounts (cpf);
CREATE INDEX IF NOT EXISTS super_admin_accounts_blocked_idx ON public.super_admin_accounts (bloqueado, ativo);

ALTER TABLE public.super_admin_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins read super admin accounts" ON public.super_admin_accounts;
CREATE POLICY "Platform admins read super admin accounts"
  ON public.super_admin_accounts
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_tenant_platform_admin()
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'nt@gmail.com'
  );

DROP POLICY IF EXISTS "Platform admins insert super admin accounts" ON public.super_admin_accounts;
CREATE POLICY "Platform admins insert super admin accounts"
  ON public.super_admin_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.is_tenant_platform_admin()
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'nt@gmail.com'
  );

DROP POLICY IF EXISTS "Platform admins update super admin accounts" ON public.super_admin_accounts;
CREATE POLICY "Platform admins update super admin accounts"
  ON public.super_admin_accounts
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_tenant_platform_admin()
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'nt@gmail.com'
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_tenant_platform_admin()
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'nt@gmail.com'
  );

DROP TRIGGER IF EXISTS update_super_admin_accounts_updated_at ON public.super_admin_accounts;
CREATE TRIGGER update_super_admin_accounts_updated_at
  BEFORE UPDATE ON public.super_admin_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.super_admin_accounts (nome, email, cpf, ativo, bloqueado, tentativas_falhas)
VALUES ('Super Admin Principal', 'nt@gmail.com', '987456321', true, false, 0)
ON CONFLICT (email) DO UPDATE
SET cpf = EXCLUDED.cpf;

CREATE OR REPLACE FUNCTION public.normalize_super_admin_identifier(_identifier text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(_identifier, '')))
$$;

CREATE OR REPLACE FUNCTION public.resolve_super_admin_login(_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identifier text := public.normalize_super_admin_identifier(_identifier);
  v_digits text := regexp_replace(v_identifier, '[^0-9]', '', 'g');
  v_account public.super_admin_accounts%ROWTYPE;
BEGIN
  SELECT *
    INTO v_account
    FROM public.super_admin_accounts
   WHERE lower(email) = v_identifier
      OR (v_digits <> '' AND cpf = v_digits)
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  RETURN jsonb_build_object(
    'matched', true,
    'account_id', v_account.id,
    'email', lower(v_account.email),
    'nome', v_account.nome,
    'ativo', v_account.ativo,
    'bloqueado', v_account.bloqueado,
    'tentativas_falhas', v_account.tentativas_falhas
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_super_admin_failed_attempt(_identifier text, _path text DEFAULT '/auth')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identifier text := public.normalize_super_admin_identifier(_identifier);
  v_digits text := regexp_replace(v_identifier, '[^0-9]', '', 'g');
  v_account public.super_admin_accounts%ROWTYPE;
  v_attempts integer;
  v_blocked boolean := false;
BEGIN
  SELECT *
    INTO v_account
    FROM public.super_admin_accounts
   WHERE lower(email) = v_identifier
      OR (v_digits <> '' AND cpf = v_digits)
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  v_attempts := coalesce(v_account.tentativas_falhas, 0) + 1;
  v_blocked := v_attempts >= 4;

  UPDATE public.super_admin_accounts
     SET tentativas_falhas = v_attempts,
         ultima_tentativa_em = now(),
         bloqueado = v_blocked,
         ativo = CASE WHEN v_blocked THEN false ELSE ativo END,
         bloqueado_em = CASE WHEN v_blocked THEN now() ELSE bloqueado_em END
   WHERE id = v_account.id;

  IF to_regclass('public.system_logs') IS NOT NULL THEN
    INSERT INTO public.system_logs (
      level,
      event,
      message,
      path,
      ip,
      user_agent,
      context
    ) VALUES (
      CASE WHEN v_blocked THEN 'error' ELSE 'warn' END,
      CASE WHEN v_blocked THEN 'super_admin_account_locked' ELSE 'super_admin_login_failed' END,
      CASE WHEN v_blocked THEN 'Conta de Super Admin bloqueada apos 4 tentativas falhas.' ELSE 'Tentativa invalida de login em conta de Super Admin.' END,
      coalesce(_path, '/auth'),
      public.get_request_ip(),
      public.get_request_header('user-agent'),
      jsonb_build_object(
        'identifier', _identifier,
        'email', v_account.email,
        'account_id', v_account.id,
        'attempts', v_attempts,
        'blocked', v_blocked
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'matched', true,
    'blocked', v_blocked,
    'attempts', v_attempts,
    'remaining', greatest(0, 4 - v_attempts)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_super_admin_login_success(_email text, _path text DEFAULT '/auth')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := public.normalize_super_admin_identifier(_email);
  v_account public.super_admin_accounts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessao ausente');
  END IF;

  SELECT *
    INTO v_account
    FROM public.super_admin_accounts
   WHERE lower(email) = v_email
      OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'matched', false);
  END IF;

  UPDATE public.super_admin_accounts
     SET auth_user_id = auth.uid(),
         tentativas_falhas = 0,
         ultima_tentativa_em = now(),
         ultimo_login_em = now(),
         ativo = true,
         bloqueado = false,
         bloqueado_em = NULL
   WHERE id = v_account.id;

  RETURN jsonb_build_object('success', true, 'matched', true, 'account_id', v_account.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_super_admin_account(_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.super_admin_accounts%ROWTYPE;
BEGIN
  IF NOT (
    public.is_super_admin()
    OR public.is_tenant_platform_admin()
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'nt@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Sem permissao para desbloquear conta de Super Admin';
  END IF;

  SELECT *
    INTO v_account
    FROM public.super_admin_accounts
   WHERE id = _account_id
   LIMIT 1;

  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'Conta de Super Admin nao encontrada';
  END IF;

  IF v_account.auth_user_id IS NOT NULL AND v_account.auth_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Outro Super Admin deve realizar a liberacao desta conta';
  END IF;

  UPDATE public.super_admin_accounts
     SET tentativas_falhas = 0,
         bloqueado = false,
         ativo = true,
         bloqueado_em = NULL,
         desbloqueado_em = now(),
         desbloqueado_por = auth.uid()
   WHERE id = _account_id;

  IF to_regclass('public.system_logs') IS NOT NULL THEN
    INSERT INTO public.system_logs (
      user_id,
      level,
      event,
      message,
      path,
      ip,
      user_agent,
      context
    ) VALUES (
      auth.uid(),
      'info',
      'super_admin_account_unlocked',
      'Conta de Super Admin liberada por outro administrador.',
      '/admin/super-admins',
      public.get_request_ip(),
      public.get_request_header('user-agent'),
      jsonb_build_object(
        'account_id', v_account.id,
        'email', v_account.email,
        'unlocked_by', auth.uid()
      )
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'account_id', v_account.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_super_admin_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_super_admin_failed_attempt(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_super_admin_login_success(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_super_admin_account(uuid) TO authenticated;

COMMIT;
