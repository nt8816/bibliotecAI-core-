DO $$
DECLARE
  v_escola_id uuid;
  v_matching_count integer;
  v_deleted_auth_count integer := 0;
  v_deleted_profile_count integer := 0;
BEGIN
  SELECT count(*)
  INTO v_matching_count
  FROM public.escolas
  WHERE lower(coalesce(subdominio, '')) = 'cdjcdel';

  IF v_matching_count = 0 THEN
    RAISE EXCEPTION 'Nenhuma escola encontrada com subdomínio cdjcdel.';
  END IF;

  IF v_matching_count > 1 THEN
    RAISE EXCEPTION 'Mais de uma escola encontrada com subdomínio cdjcdel. Operação cancelada por segurança.';
  END IF;

  SELECT id
  INTO v_escola_id
  FROM public.escolas
  WHERE lower(coalesce(subdominio, '')) = 'cdjcdel'
  ORDER BY created_at DESC NULLS LAST, id DESC
  LIMIT 1;

  WITH deleted_auth AS (
    DELETE FROM auth.users au
    USING public.usuarios_biblioteca ub
    WHERE au.id = ub.user_id
      AND ub.tipo = 'aluno'
      AND ub.escola_id = v_escola_id
      AND lower(trim(coalesce(ub.turma, ''))) = 'cursando'
    RETURNING au.id
  )
  SELECT count(*) INTO v_deleted_auth_count FROM deleted_auth;

  WITH deleted_profiles AS (
    DELETE FROM public.usuarios_biblioteca ub
    WHERE ub.tipo = 'aluno'
      AND ub.escola_id = v_escola_id
      AND lower(trim(coalesce(ub.turma, ''))) = 'cursando'
    RETURNING ub.id
  )
  SELECT count(*) INTO v_deleted_profile_count FROM deleted_profiles;

  RAISE NOTICE 'Escola %: % auth.users removidos, % perfis restantes removidos da turma cursando.',
    v_escola_id,
    v_deleted_auth_count,
    v_deleted_profile_count;
END $$;
