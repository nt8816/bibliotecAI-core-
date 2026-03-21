BEGIN;

UPDATE auth.users
SET
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', 'Francisco Rai Silva Santos')
WHERE id = 'd74c07e3-0c59-416c-8a26-ed1d794a7e1d';

INSERT INTO public.user_roles (user_id, role)
VALUES ('d74c07e3-0c59-416c-8a26-ed1d794a7e1d', 'super_admin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.super_admin_accounts (
  auth_user_id,
  nome,
  email,
  ativo,
  bloqueado,
  tentativas_falhas
)
VALUES (
  'd74c07e3-0c59-416c-8a26-ed1d794a7e1d',
  'Francisco Rai Silva Santos',
  'franciscorai1358@gmail.com',
  true,
  false,
  0
)
ON CONFLICT (email) DO UPDATE
SET
  auth_user_id = EXCLUDED.auth_user_id,
  nome = EXCLUDED.nome,
  ativo = true,
  bloqueado = false,
  tentativas_falhas = 0,
  bloqueado_em = NULL;

COMMIT;
