DO $$
DECLARE
  target_user_id UUID;
BEGIN
  SELECT id
  INTO target_user_id
  FROM auth.users
  WHERE lower(email) = 'nt@gmail.com'
  LIMIT 1;

  DELETE FROM public.super_admin_accounts
  WHERE lower(email) = 'nt@gmail.com'
     OR auth_user_id::text = target_user_id::text;

  DELETE FROM public.user_roles
  WHERE user_id::text = target_user_id::text;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios_biblioteca'
      AND column_name = 'email'
  ) THEN
    DELETE FROM public.usuarios_biblioteca
    WHERE lower(coalesce(email, '')) = 'nt@gmail.com'
       OR user_id::text = target_user_id::text;
  END IF;

  DELETE FROM auth.identities
  WHERE user_id::text = target_user_id::text;

  DELETE FROM auth.sessions
  WHERE user_id::text = target_user_id::text;

  DELETE FROM auth.refresh_tokens
  WHERE user_id::text = target_user_id::text;

  DELETE FROM auth.mfa_factors
  WHERE user_id::text = target_user_id::text;

  DELETE FROM auth.one_time_tokens
  WHERE user_id::text = target_user_id::text;

  DELETE FROM auth.users
  WHERE id = target_user_id;
END $$;
