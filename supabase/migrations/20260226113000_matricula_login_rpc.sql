-- RPCs para login por matrícula sem depender de leitura direta da tabela no cliente anônimo.

CREATE OR REPLACE FUNCTION public.get_login_email_by_matricula(_matricula text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
BEGIN
  IF _matricula IS NULL OR btrim(_matricula) = '' THEN
    RETURN NULL;
  END IF;

  SELECT ub.email
  INTO v_email
  FROM public.usuarios_biblioteca ub
  WHERE regexp_replace(lower(coalesce(ub.matricula, '')), '[^a-z0-9]', '', 'g')
      = regexp_replace(lower(_matricula), '[^a-z0-9]', '', 'g')
    AND ub.user_id IS NOT NULL
  ORDER BY ub.updated_at DESC NULLS LAST, ub.created_at DESC
  LIMIT 1;

  RETURN v_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_matricula_login_activated(_matricula text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_exists boolean;
  v_activated boolean;
BEGIN
  IF _matricula IS NULL OR btrim(_matricula) = '' THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_biblioteca ub
    WHERE regexp_replace(lower(coalesce(ub.matricula, '')), '[^a-z0-9]', '', 'g')
        = regexp_replace(lower(_matricula), '[^a-z0-9]', '', 'g')
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_biblioteca ub
    WHERE regexp_replace(lower(coalesce(ub.matricula, '')), '[^a-z0-9]', '', 'g')
        = regexp_replace(lower(_matricula), '[^a-z0-9]', '', 'g')
      AND ub.user_id IS NOT NULL
  ) INTO v_activated;

  RETURN v_activated;
END;
$$;

REVOKE ALL ON FUNCTION public.get_login_email_by_matricula(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_login_email_by_matricula(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.is_matricula_login_activated(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_matricula_login_activated(text) TO anon, authenticated;
