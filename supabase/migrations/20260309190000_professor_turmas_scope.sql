-- Vincula professores às turmas definidas pelo gestor e restringe a visão do professor

CREATE TABLE IF NOT EXISTS public.professor_turmas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  escola_id UUID NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
  turma TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT professor_turmas_turma_not_blank CHECK (btrim(turma) <> ''),
  CONSTRAINT professor_turmas_unique UNIQUE (professor_id, turma)
);

CREATE INDEX IF NOT EXISTS professor_turmas_professor_idx ON public.professor_turmas (professor_id);
CREATE INDEX IF NOT EXISTS professor_turmas_escola_turma_idx ON public.professor_turmas (escola_id, turma);

ALTER TABLE public.professor_turmas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view professor_turmas in school" ON public.professor_turmas;
DROP POLICY IF EXISTS "Gestor can manage professor_turmas in school" ON public.professor_turmas;

CREATE POLICY "Users can view professor_turmas in school"
  ON public.professor_turmas
  FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.is_professor()
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca p
        WHERE p.id = professor_turmas.professor_id
          AND p.user_id = auth.uid()
      )
    )
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  );

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
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca p
        WHERE p.id = professor_turmas.professor_id
          AND p.tipo = 'professor'::public.app_role
          AND p.escola_id = professor_turmas.escola_id
      )
    )
  );

DROP TRIGGER IF EXISTS update_professor_turmas_updated_at ON public.professor_turmas;
CREATE TRIGGER update_professor_turmas_updated_at
  BEFORE UPDATE ON public.professor_turmas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'professor_turmas'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.professor_turmas';
  END IF;
END $$;

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

-- Professores passam a ver apenas alunos das turmas vinculadas
DROP POLICY IF EXISTS "Professors can view students in school" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Professors can view students of their school" ON public.usuarios_biblioteca;

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
      JOIN public.usuarios_biblioteca prof ON prof.id = pt.professor_id
      WHERE prof.user_id = auth.uid()
        AND pt.escola_id = usuarios_biblioteca.escola_id
        AND pt.turma = usuarios_biblioteca.turma
    )
  );

-- Atividades: professor enxerga apenas atividades de alunos das turmas vinculadas
DROP POLICY IF EXISTS "Professors can view their activities" ON public.atividades_leitura;

CREATE POLICY "Professors can view their activities"
  ON public.atividades_leitura
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_gestor()
    OR public.is_bibliotecaria()
    OR (
      public.is_professor()
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca aluno
        JOIN public.professor_turmas pt
          ON pt.escola_id = aluno.escola_id
         AND pt.turma = aluno.turma
        JOIN public.usuarios_biblioteca prof
          ON prof.id = pt.professor_id
        WHERE aluno.id = atividades_leitura.aluno_id
          AND prof.user_id = auth.uid()
      )
    )
  );

-- Sugestões: professor enxerga apenas sugestões de alunos das turmas vinculadas
DROP POLICY IF EXISTS "Professors can view their suggestions" ON public.sugestoes_livros;

CREATE POLICY "Professors can view their suggestions"
  ON public.sugestoes_livros
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_gestor()
    OR public.is_bibliotecaria()
    OR (
      public.is_professor()
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca aluno
        JOIN public.professor_turmas pt
          ON pt.escola_id = aluno.escola_id
         AND pt.turma = aluno.turma
        JOIN public.usuarios_biblioteca prof
          ON prof.id = pt.professor_id
        WHERE aluno.id = sugestoes_livros.aluno_id
          AND prof.user_id = auth.uid()
      )
    )
  );

-- Entregas: professor enxerga/atualiza somente entregas de alunos das turmas vinculadas
DROP POLICY IF EXISTS "Students and staff can view submissions" ON public.atividades_entregas;
DROP POLICY IF EXISTS "Students and staff can update submission" ON public.atividades_entregas;
DROP POLICY IF EXISTS "Students and staff can delete submission" ON public.atividades_entregas;

CREATE POLICY "Students and staff can view submissions"
  ON public.atividades_entregas
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_gestor()
    OR public.is_bibliotecaria()
    OR (
      public.is_professor()
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca aluno
        JOIN public.professor_turmas pt
          ON pt.escola_id = aluno.escola_id
         AND pt.turma = aluno.turma
        JOIN public.usuarios_biblioteca prof
          ON prof.id = pt.professor_id
        WHERE aluno.id = atividades_entregas.aluno_id
          AND prof.user_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = atividades_entregas.aluno_id
        AND ub.user_id = auth.uid()
    )
  );

CREATE POLICY "Students and staff can update submission"
  ON public.atividades_entregas
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR public.is_gestor()
    OR public.is_bibliotecaria()
    OR (
      public.is_professor()
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca aluno
        JOIN public.professor_turmas pt
          ON pt.escola_id = aluno.escola_id
         AND pt.turma = aluno.turma
        JOIN public.usuarios_biblioteca prof
          ON prof.id = pt.professor_id
        WHERE aluno.id = atividades_entregas.aluno_id
          AND prof.user_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = atividades_entregas.aluno_id
        AND ub.user_id = auth.uid()
    )
  );

CREATE POLICY "Students and staff can delete submission"
  ON public.atividades_entregas
  FOR DELETE
  USING (
    public.is_super_admin()
    OR public.is_gestor()
    OR public.is_bibliotecaria()
    OR (
      public.is_professor()
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca aluno
        JOIN public.professor_turmas pt
          ON pt.escola_id = aluno.escola_id
         AND pt.turma = aluno.turma
        JOIN public.usuarios_biblioteca prof
          ON prof.id = pt.professor_id
        WHERE aluno.id = atividades_entregas.aluno_id
          AND prof.user_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = atividades_entregas.aluno_id
        AND ub.user_id = auth.uid()
    )
  );
