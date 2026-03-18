DO $$
DECLARE
  v_deleted_auth_count integer := 0;
  v_deleted_profile_count integer := 0;
BEGIN
  WITH deleted_auth AS (
    DELETE FROM auth.users au
    USING public.usuarios_biblioteca ub
    WHERE au.id = ub.user_id
      AND ub.tipo = 'aluno'
      AND lower(trim(coalesce(ub.turma, ''))) = 'cursando'
    RETURNING au.id
  )
  SELECT count(*) INTO v_deleted_auth_count FROM deleted_auth;

  WITH deleted_profiles AS (
    DELETE FROM public.usuarios_biblioteca ub
    WHERE ub.tipo = 'aluno'
      AND lower(trim(coalesce(ub.turma, ''))) = 'cursando'
    RETURNING ub.id
  )
  SELECT count(*) INTO v_deleted_profile_count FROM deleted_profiles;

  RAISE NOTICE 'Removidos % registros de auth.users e % perfis restantes da turma cursando.',
    v_deleted_auth_count,
    v_deleted_profile_count;
END $$;
