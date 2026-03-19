ALTER TABLE public.comunidade_posts
  ADD COLUMN IF NOT EXISTS turma_publico text;

CREATE INDEX IF NOT EXISTS comunidade_posts_turma_publico_idx
  ON public.comunidade_posts(turma_publico);

DROP POLICY IF EXISTS "School users can view community posts" ON public.comunidade_posts;

CREATE POLICY "School users can view community posts"
  ON public.comunidade_posts
  FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.is_same_escola(escola_id)
      AND (
        COALESCE(BTRIM(turma_publico), '') = ''
        OR public.is_gestor()
        OR public.is_bibliotecaria()
        OR public.is_professor()
        OR EXISTS (
          SELECT 1
          FROM public.usuarios_biblioteca ub
          WHERE ub.user_id = auth.uid()
            AND ub.escola_id = comunidade_posts.escola_id
            AND COALESCE(BTRIM(ub.turma), '') = COALESCE(BTRIM(comunidade_posts.turma_publico), '')
        )
      )
    )
  );
