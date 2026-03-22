CREATE OR REPLACE FUNCTION public.get_reclamacoes_super_admin_feed()
RETURNS TABLE (
  id uuid,
  sender_user_id uuid,
  sender_profile_id uuid,
  sender_nome text,
  sender_email text,
  sender_role text,
  escola_id uuid,
  escola_nome text,
  assunto text,
  mensagem text,
  image_urls text[],
  status text,
  resposta text,
  created_at timestamptz,
  updated_at timestamptz,
  respondida_em timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
    rsa.assunto,
    rsa.mensagem,
    rsa.image_urls,
    rsa.status,
    rsa.resposta,
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
$$;

GRANT EXECUTE ON FUNCTION public.get_reclamacoes_super_admin_feed() TO authenticated;
