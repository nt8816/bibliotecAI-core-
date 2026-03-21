BEGIN;

DELETE FROM public.user_roles
WHERE user_id IN (
  SELECT id
  FROM auth.users
  WHERE lower(email) = 'nt@gmail.com'
)
AND role = 'super_admin'::public.app_role;

DELETE FROM public.super_admin_accounts
WHERE lower(email) = 'nt@gmail.com';

COMMIT;
