BEGIN;

CREATE OR REPLACE FUNCTION public.is_tenant_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
$$;

UPDATE public.super_admin_accounts saa
SET auth_user_id = au.id
FROM auth.users au
WHERE lower(au.email) = lower(saa.email)
  AND (saa.auth_user_id IS NULL OR saa.auth_user_id <> au.id);

INSERT INTO public.user_roles (user_id, role)
SELECT saa.auth_user_id, 'super_admin'::public.app_role
FROM public.super_admin_accounts saa
WHERE saa.auth_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = saa.auth_user_id
      AND ur.role = 'super_admin'::public.app_role
  );

DROP POLICY IF EXISTS "Users can view own complaints and super admins view all" ON public.reclamacoes_super_admin;
CREATE POLICY "Users can view own complaints and super admins view all"
  ON public.reclamacoes_super_admin
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = sender_user_id
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Super admins can update complaints" ON public.reclamacoes_super_admin;
CREATE POLICY "Super admins can update complaints"
  ON public.reclamacoes_super_admin
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Platform admins read system logs" ON public.system_logs;
CREATE POLICY "Platform admins read system logs"
  ON public.system_logs
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Platform admins read super admin accounts" ON public.super_admin_accounts;
CREATE POLICY "Platform admins read super admin accounts"
  ON public.super_admin_accounts
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Platform admins insert super admin accounts" ON public.super_admin_accounts;
CREATE POLICY "Platform admins insert super admin accounts"
  ON public.super_admin_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Platform admins update super admin accounts" ON public.super_admin_accounts;
CREATE POLICY "Platform admins update super admin accounts"
  ON public.super_admin_accounts
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.unlock_super_admin_account(_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.super_admin_accounts%ROWTYPE;
BEGIN
  IF NOT public.is_super_admin() THEN
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

COMMIT;
