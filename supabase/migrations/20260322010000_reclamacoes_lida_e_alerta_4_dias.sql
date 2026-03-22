UPDATE public.reclamacoes_super_admin
SET status = 'em_analise'
WHERE status = 'nova';

ALTER TABLE public.reclamacoes_super_admin
  DROP CONSTRAINT IF EXISTS reclamacoes_super_admin_status_check;

ALTER TABLE public.reclamacoes_super_admin
  ALTER COLUMN status SET DEFAULT 'em_analise';

ALTER TABLE public.reclamacoes_super_admin
  ADD CONSTRAINT reclamacoes_super_admin_status_check
  CHECK (status IN ('em_analise', 'respondida', 'arquivada'));

CREATE OR REPLACE FUNCTION public.sync_reclamacao_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_nome TEXT;
  v_email TEXT;
  v_profile_id UUID;
  v_escola_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sender_user_id := auth.uid();
    NEW.status := COALESCE(NULLIF(trim(COALESCE(NEW.status, '')), ''), 'em_analise');

    SELECT ur.role::text
      INTO v_role
      FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.role::text IN ('gestor', 'bibliotecaria', 'professor', 'aluno')
     ORDER BY CASE ur.role::text
       WHEN 'gestor' THEN 1
       WHEN 'bibliotecaria' THEN 2
       WHEN 'professor' THEN 3
       WHEN 'aluno' THEN 4
       ELSE 99
     END
     LIMIT 1;

    SELECT ub.id, ub.escola_id, ub.nome, ub.email
      INTO v_profile_id, v_escola_id, v_nome, v_email
      FROM public.usuarios_biblioteca ub
     WHERE ub.user_id = auth.uid()
     ORDER BY ub.updated_at DESC NULLS LAST, ub.created_at DESC
     LIMIT 1;

    IF v_email IS NULL THEN
      SELECT au.email
        INTO v_email
        FROM auth.users au
       WHERE au.id = auth.uid();
    END IF;

    NEW.sender_profile_id := COALESCE(NEW.sender_profile_id, v_profile_id);
    NEW.escola_id := COALESCE(NEW.escola_id, v_escola_id);
    NEW.sender_nome := COALESCE(NULLIF(trim(v_nome), ''), NULLIF(trim(NEW.sender_nome), ''));
    NEW.sender_email := COALESCE(NULLIF(trim(v_email), ''), NULLIF(trim(NEW.sender_email), ''));
    NEW.sender_role := COALESCE(NULLIF(trim(v_role), ''), NULLIF(trim(NEW.sender_role), ''));
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := now();

    IF NEW.status <> OLD.status AND NEW.lida_em IS NULL THEN
      NEW.lida_em := now();
    END IF;

    IF COALESCE(NEW.resposta, '') <> COALESCE(OLD.resposta, '') AND NULLIF(trim(COALESCE(NEW.resposta, '')), '') IS NOT NULL THEN
      NEW.respondida_em := now();
      IF NEW.status = 'em_analise' THEN
        NEW.status := 'respondida';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_reclamacao_super_admin_lida(_reclamacao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.reclamacoes_super_admin%ROWTYPE;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Sem permissao para marcar reclamacao como lida';
  END IF;

  SELECT *
    INTO v_target
    FROM public.reclamacoes_super_admin
   WHERE id = _reclamacao_id
   LIMIT 1;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Reclamacao nao encontrada';
  END IF;

  UPDATE public.reclamacoes_super_admin
     SET lida_em = COALESCE(lida_em, now())
   WHERE id = _reclamacao_id;

  RETURN jsonb_build_object('success', true, 'id', _reclamacao_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_reclamacao_super_admin_lida(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_reclamacoes_super_admin_feed();

CREATE FUNCTION public.get_reclamacoes_super_admin_feed()
RETURNS TABLE (
  id uuid,
  sender_user_id uuid,
  sender_profile_id uuid,
  sender_nome text,
  sender_email text,
  sender_role text,
  escola_id uuid,
  escola_nome text,
  sender_turma text,
  assunto text,
  mensagem text,
  image_urls text[],
  status text,
  resposta text,
  lida_em timestamptz,
  alerta_prazo boolean,
  created_at timestamptz,
  updated_at timestamptz,
  respondida_em timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.cleanup_old_resolved_reclamacoes_super_admin();

  RETURN QUERY
  SELECT
    rsa.id,
    rsa.sender_user_id,
    rsa.sender_profile_id,
    rsa.sender_nome,
    rsa.sender_email,
    rsa.sender_role,
    rsa.escola_id,
    COALESCE(
      esc_direta.nome,
      esc_profile.nome,
      esc_user.nome,
      esc_email.nome
    ) AS escola_nome,
    COALESCE(ub_profile.turma, ub_user.turma, ub_email.turma) AS sender_turma,
    rsa.assunto,
    rsa.mensagem,
    rsa.image_urls,
    rsa.status,
    rsa.resposta,
    rsa.lida_em,
    (
      rsa.status = 'em_analise'
      AND COALESCE(rsa.lida_em, rsa.updated_at, rsa.created_at) <= now() - interval '4 days'
    ) AS alerta_prazo,
    rsa.created_at,
    rsa.updated_at,
    rsa.respondida_em
  FROM public.reclamacoes_super_admin rsa
  LEFT JOIN public.escolas esc_direta
    ON esc_direta.id = rsa.escola_id
  LEFT JOIN public.usuarios_biblioteca ub_profile
    ON ub_profile.id = rsa.sender_profile_id
  LEFT JOIN public.escolas esc_profile
    ON esc_profile.id = ub_profile.escola_id
  LEFT JOIN public.usuarios_biblioteca ub_user
    ON ub_user.user_id = rsa.sender_user_id
  LEFT JOIN public.escolas esc_user
    ON esc_user.id = ub_user.escola_id
  LEFT JOIN public.usuarios_biblioteca ub_email
    ON lower(ub_email.email) = lower(coalesce(rsa.sender_email, ''))
  LEFT JOIN public.escolas esc_email
    ON esc_email.id = ub_email.escola_id
  WHERE (
    public.is_super_admin()
    OR auth.uid() = rsa.sender_user_id
  )
  ORDER BY rsa.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reclamacoes_super_admin_feed() TO authenticated;
