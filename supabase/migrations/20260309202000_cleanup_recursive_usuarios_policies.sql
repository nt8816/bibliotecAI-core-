BEGIN;

CREATE OR REPLACE FUNCTION public.is_professor_profile_in_escola(_profile_id uuid, _escola_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_biblioteca ub
    WHERE ub.id = _profile_id
      AND ub.tipo = 'professor'::public.app_role
      AND ub.escola_id = _escola_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_professor_profile_in_escola(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_professor_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ub.id
  FROM public.usuarios_biblioteca ub
  WHERE ub.user_id = auth.uid()
    AND ub.tipo = 'professor'::public.app_role
  ORDER BY ub.updated_at DESC NULLS LAST, ub.created_at DESC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_professor_profile_id() TO authenticated;

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
  );

DROP POLICY IF EXISTS "Gestor can manage professor_turmas in school" ON public.professor_turmas;
CREATE POLICY "Gestor can manage professor_turmas in school"
  ON public.professor_turmas
  FOR ALL
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
      AND public.is_professor_profile_in_escola(professor_id, escola_id)
    )
  );

-- Remove qualquer policy em usuarios_biblioteca que se auto-referencia,
-- evitando recursao infinita de RLS em ambientes com estado legado.
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'usuarios_biblioteca'
      AND (
        coalesce(qual, '') ILIKE '%public.usuarios_biblioteca%'
        OR coalesce(qual, '') ILIKE '% from usuarios_biblioteca%'
        OR coalesce(qual, '') ILIKE '% from public.usuarios_biblioteca%'
        OR coalesce(with_check, '') ILIKE '%public.usuarios_biblioteca%'
        OR coalesce(with_check, '') ILIKE '% from usuarios_biblioteca%'
        OR coalesce(with_check, '') ILIKE '% from public.usuarios_biblioteca%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.usuarios_biblioteca', p.policyname);
  END LOOP;
END $$;

-- Garante remocao explicita dos nomes historicos conhecidos.
DROP POLICY IF EXISTS "Professors can view students of their school" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Professors can view students in school" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Professors can view students in assigned classes" ON public.usuarios_biblioteca;

-- Recria a policy de professor sem auto-referencia de usuarios_biblioteca.
CREATE POLICY "Professors can view students in assigned classes"
  ON public.usuarios_biblioteca
  FOR SELECT
  USING (
    public.is_professor()
    AND tipo = 'aluno'::public.app_role
    AND public.is_same_escola(escola_id)
    AND EXISTS (
      SELECT 1
      FROM public.professor_turmas pt
      WHERE pt.professor_id = public.current_professor_profile_id()
        AND pt.escola_id = usuarios_biblioteca.escola_id
        AND pt.turma = usuarios_biblioteca.turma
    )
  );

COMMIT;
