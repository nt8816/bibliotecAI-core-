-- Fix RLS infinite recursion on public.usuarios_biblioteca by removing self-referencing subquery
-- and using a SECURITY DEFINER helper function.

BEGIN;

-- 1) Drop the problematic policy if it exists
DROP POLICY IF EXISTS "Professors can view students of their school" ON public.usuarios_biblioteca;

-- 2) Helper: get the escola_id for a given auth user (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_escola_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ub.escola_id
  FROM public.usuarios_biblioteca AS ub
  WHERE ub.user_id = _user_id
  LIMIT 1
$$;

-- 3) Recreate the policy without querying usuarios_biblioteca inside the policy expression
CREATE POLICY "Professors can view students of their school"
ON public.usuarios_biblioteca
FOR SELECT
TO authenticated
USING (
  public.is_professor()
  AND tipo = 'aluno'::public.app_role
  AND escola_id IS NOT NULL
  AND escola_id = public.get_user_escola_id(auth.uid())
);

COMMIT;