CREATE OR REPLACE FUNCTION public.current_aluno_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ub.id
  FROM public.usuarios_biblioteca ub
  WHERE ub.user_id = auth.uid()
    AND ub.tipo = 'aluno'::public.app_role
  ORDER BY ub.updated_at DESC NULLS LAST, ub.created_at DESC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_aluno_profile_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_aluno_escola_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ub.escola_id
  FROM public.usuarios_biblioteca ub
  WHERE ub.id = public.current_aluno_profile_id()
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_aluno_escola_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_aluno_turma()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ub.turma
  FROM public.usuarios_biblioteca ub
  WHERE ub.id = public.current_aluno_profile_id()
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_aluno_turma() TO authenticated;

DROP POLICY IF EXISTS "Users can view professor_turmas in school" ON public.professor_turmas;
CREATE POLICY "Users can view professor_turmas in school"
  ON public.professor_turmas
  FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
    OR (
      public.is_professor()
      AND professor_id = public.current_professor_profile_id()
    )
    OR (
      escola_id = public.current_aluno_escola_id()
      AND turma = public.current_aluno_turma()
    )
  );

DROP POLICY IF EXISTS "Students can view assigned professors" ON public.usuarios_biblioteca;
CREATE POLICY "Students can view assigned professors"
  ON public.usuarios_biblioteca
  FOR SELECT
  USING (
    tipo = 'professor'::public.app_role
    AND escola_id = public.current_aluno_escola_id()
    AND EXISTS (
      SELECT 1
      FROM public.professor_turmas pt
      WHERE pt.professor_id = usuarios_biblioteca.id
        AND pt.escola_id = usuarios_biblioteca.escola_id
        AND pt.turma = public.current_aluno_turma()
    )
  );
