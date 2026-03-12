CREATE TABLE IF NOT EXISTS public.comunidade_quiz_tentativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.comunidade_posts(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  escola_id UUID REFERENCES public.escolas(id) ON DELETE SET NULL,
  acertos INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comunidade_quiz_tentativas_post_idx ON public.comunidade_quiz_tentativas(post_id);
CREATE INDEX IF NOT EXISTS comunidade_quiz_tentativas_aluno_idx ON public.comunidade_quiz_tentativas(aluno_id);
CREATE INDEX IF NOT EXISTS comunidade_quiz_tentativas_escola_idx ON public.comunidade_quiz_tentativas(escola_id);

ALTER TABLE public.comunidade_quiz_tentativas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School users can view quiz attempts" ON public.comunidade_quiz_tentativas;
DROP POLICY IF EXISTS "Students can insert quiz attempts" ON public.comunidade_quiz_tentativas;
DROP POLICY IF EXISTS "Students and staff can update quiz attempts" ON public.comunidade_quiz_tentativas;
DROP POLICY IF EXISTS "Students and staff can delete quiz attempts" ON public.comunidade_quiz_tentativas;

CREATE POLICY "School users can view quiz attempts"
  ON public.comunidade_quiz_tentativas
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_same_escola(escola_id)
    OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca ub
      WHERE ub.id = comunidade_quiz_tentativas.aluno_id
        AND ub.user_id = auth.uid()
    )
  );

CREATE POLICY "Students can insert quiz attempts"
  ON public.comunidade_quiz_tentativas
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_same_escola(escola_id)
      AND EXISTS (
        SELECT 1 FROM public.usuarios_biblioteca ub
        WHERE ub.id = comunidade_quiz_tentativas.aluno_id
          AND ub.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Students and staff can update quiz attempts"
  ON public.comunidade_quiz_tentativas
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR public.is_gestor()
    OR public.is_bibliotecaria()
    OR public.is_professor()
    OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca ub
      WHERE ub.id = comunidade_quiz_tentativas.aluno_id
        AND ub.user_id = auth.uid()
    )
  );

CREATE POLICY "Students and staff can delete quiz attempts"
  ON public.comunidade_quiz_tentativas
  FOR DELETE
  USING (
    public.is_super_admin()
    OR public.is_gestor()
    OR public.is_bibliotecaria()
    OR public.is_professor()
    OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca ub
      WHERE ub.id = comunidade_quiz_tentativas.aluno_id
        AND ub.user_id = auth.uid()
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_emprestimo_pendente_unique
  ON public.solicitacoes_emprestimo (usuario_id, livro_id)
  WHERE status = 'pendente';
