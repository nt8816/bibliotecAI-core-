BEGIN;

CREATE OR REPLACE FUNCTION public.register_super_admin_failed_attempt(
  _identifier text,
  _path text DEFAULT '/auth',
  _context jsonb DEFAULT NULL
)
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
  v_context jsonb := coalesce(_context, '{}'::jsonb);
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
      CASE WHEN v_blocked THEN 'TENTATIVA DE INVASAO !!! Conta de Super Admin bloqueada apos 4 tentativas falhas.' ELSE 'TENTATIVA DE INVASAO !!! Tentativa invalida de login em conta de Super Admin.' END,
      coalesce(_path, '/auth'),
      public.get_request_ip(),
      public.get_request_header('user-agent'),
      jsonb_build_object(
        'identifier', _identifier,
        'email', v_account.email,
        'account_id', v_account.id,
        'attempts', v_attempts,
        'blocked', v_blocked
      ) || v_context
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

GRANT EXECUTE ON FUNCTION public.register_super_admin_failed_attempt(text, text, jsonb) TO anon, authenticated;

COMMIT;
