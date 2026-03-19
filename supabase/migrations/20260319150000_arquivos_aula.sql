CREATE TABLE IF NOT EXISTS public.arquivos_aula_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  escola_id UUID NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
  turma_publico TEXT,
  mensagem TEXT NOT NULL,
  arquivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arquivos_aula_posts_escola_idx ON public.arquivos_aula_posts(escola_id);
CREATE INDEX IF NOT EXISTS arquivos_aula_posts_turma_idx ON public.arquivos_aula_posts(turma_publico);
CREATE INDEX IF NOT EXISTS arquivos_aula_posts_autor_idx ON public.arquivos_aula_posts(autor_id);

ALTER TABLE public.arquivos_aula_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School users can view arquivos aula" ON public.arquivos_aula_posts;
DROP POLICY IF EXISTS "Professors can create arquivos aula" ON public.arquivos_aula_posts;
DROP POLICY IF EXISTS "Authors can update arquivos aula" ON public.arquivos_aula_posts;
DROP POLICY IF EXISTS "Authors can delete arquivos aula" ON public.arquivos_aula_posts;

CREATE POLICY "School users can view arquivos aula"
  ON public.arquivos_aula_posts
  FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.is_same_escola(escola_id)
      AND (
        COALESCE(BTRIM(turma_publico), '') = ''
        OR public.is_professor()
        OR public.is_gestor()
        OR public.is_bibliotecaria()
        OR EXISTS (
          SELECT 1
          FROM public.usuarios_biblioteca ub
          WHERE ub.user_id = auth.uid()
            AND ub.escola_id = arquivos_aula_posts.escola_id
            AND COALESCE(BTRIM(ub.turma), '') = COALESCE(BTRIM(arquivos_aula_posts.turma_publico), '')
        )
      )
    )
  );

CREATE POLICY "Professors can create arquivos aula"
  ON public.arquivos_aula_posts
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = arquivos_aula_posts.autor_id
        AND ub.user_id = auth.uid()
        AND ub.tipo = 'professor'
        AND ub.escola_id = arquivos_aula_posts.escola_id
        AND (
          COALESCE(BTRIM(arquivos_aula_posts.turma_publico), '') = ''
          OR EXISTS (
            SELECT 1
            FROM public.professor_turmas pt
            WHERE pt.professor_id = ub.id
              AND pt.escola_id = arquivos_aula_posts.escola_id
              AND COALESCE(BTRIM(pt.turma), '') = COALESCE(BTRIM(arquivos_aula_posts.turma_publico), '')
          )
        )
    )
  );

CREATE POLICY "Authors can update arquivos aula"
  ON public.arquivos_aula_posts
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = arquivos_aula_posts.autor_id
        AND ub.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = arquivos_aula_posts.autor_id
        AND ub.user_id = auth.uid()
        AND ub.tipo = 'professor'
        AND ub.escola_id = arquivos_aula_posts.escola_id
        AND (
          COALESCE(BTRIM(arquivos_aula_posts.turma_publico), '') = ''
          OR EXISTS (
            SELECT 1
            FROM public.professor_turmas pt
            WHERE pt.professor_id = ub.id
              AND pt.escola_id = arquivos_aula_posts.escola_id
              AND COALESCE(BTRIM(pt.turma), '') = COALESCE(BTRIM(arquivos_aula_posts.turma_publico), '')
          )
        )
    )
  );

CREATE POLICY "Authors can delete arquivos aula"
  ON public.arquivos_aula_posts
  FOR DELETE
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = arquivos_aula_posts.autor_id
        AND ub.user_id = auth.uid()
    )
  );

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('arquivos-aula', 'arquivos-aula', false)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

DROP POLICY IF EXISTS "Authenticated users can read arquivos aula objects" ON storage.objects;
DROP POLICY IF EXISTS "Professors can insert arquivos aula objects" ON storage.objects;
DROP POLICY IF EXISTS "Owners can update arquivos aula objects" ON storage.objects;
DROP POLICY IF EXISTS "Owners can delete arquivos aula objects" ON storage.objects;

CREATE POLICY "Authenticated users can read arquivos aula objects"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'arquivos-aula' AND auth.role() = 'authenticated');

CREATE POLICY "Professors can insert arquivos aula objects"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'arquivos-aula' AND auth.role() = 'authenticated' AND public.is_professor());

CREATE POLICY "Owners can update arquivos aula objects"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'arquivos-aula' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'arquivos-aula' AND owner = auth.uid());

CREATE POLICY "Owners can delete arquivos aula objects"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'arquivos-aula' AND owner = auth.uid());
