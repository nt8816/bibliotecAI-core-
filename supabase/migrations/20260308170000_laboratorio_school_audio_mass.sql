-- Isolamento por escola para comunidade/audiobooks + armazenamento de criações do laboratório.

ALTER TABLE public.audiobooks_biblioteca
  ADD COLUMN IF NOT EXISTS escola_id uuid REFERENCES public.escolas(id) ON DELETE SET NULL;

ALTER TABLE public.comunidade_posts
  ADD COLUMN IF NOT EXISTS escola_id uuid REFERENCES public.escolas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS audiobooks_biblioteca_escola_id_idx ON public.audiobooks_biblioteca(escola_id);
CREATE INDEX IF NOT EXISTS comunidade_posts_escola_id_idx ON public.comunidade_posts(escola_id);

UPDATE public.audiobooks_biblioteca ab
SET escola_id = l.escola_id
FROM public.livros l
WHERE ab.livro_id = l.id
  AND ab.escola_id IS NULL
  AND l.escola_id IS NOT NULL;

UPDATE public.comunidade_posts cp
SET escola_id = ub.escola_id
FROM public.usuarios_biblioteca ub
WHERE cp.autor_id = ub.id
  AND cp.escola_id IS NULL
  AND ub.escola_id IS NOT NULL;

DROP POLICY IF EXISTS "Everyone can view community posts" ON public.comunidade_posts;
DROP POLICY IF EXISTS "Users can create own community posts" ON public.comunidade_posts;
DROP POLICY IF EXISTS "Users can update own community posts" ON public.comunidade_posts;
DROP POLICY IF EXISTS "Users can delete own community posts" ON public.comunidade_posts;
DROP POLICY IF EXISTS "Gestao can delete community posts" ON public.comunidade_posts;

CREATE POLICY "School users can view community posts"
  ON public.comunidade_posts
  FOR SELECT
  USING (public.is_super_admin() OR public.is_same_escola(escola_id));

CREATE POLICY "School users can create community posts"
  ON public.comunidade_posts
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_same_escola(escola_id)
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca ub
        WHERE ub.id = comunidade_posts.autor_id
          AND ub.user_id = auth.uid()
          AND ub.escola_id = comunidade_posts.escola_id
      )
    )
  );

CREATE POLICY "School users can update own community posts"
  ON public.comunidade_posts
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR ((public.is_gestor() OR public.is_bibliotecaria()) AND public.is_same_escola(escola_id))
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = comunidade_posts.autor_id
        AND ub.user_id = auth.uid()
        AND ub.escola_id = comunidade_posts.escola_id
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_same_escola(escola_id)
      AND (
        (public.is_gestor() OR public.is_bibliotecaria())
        OR EXISTS (
          SELECT 1
          FROM public.usuarios_biblioteca ub
          WHERE ub.id = comunidade_posts.autor_id
            AND ub.user_id = auth.uid()
            AND ub.escola_id = comunidade_posts.escola_id
        )
      )
    )
  );

CREATE POLICY "School users can delete community posts"
  ON public.comunidade_posts
  FOR DELETE
  USING (
    public.is_super_admin()
    OR ((public.is_gestor() OR public.is_bibliotecaria()) AND public.is_same_escola(escola_id))
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = comunidade_posts.autor_id
        AND ub.user_id = auth.uid()
        AND ub.escola_id = comunidade_posts.escola_id
    )
  );

DROP POLICY IF EXISTS "Everyone can view likes" ON public.comunidade_curtidas;
DROP POLICY IF EXISTS "Users can like with own profile" ON public.comunidade_curtidas;
DROP POLICY IF EXISTS "Users can remove own likes" ON public.comunidade_curtidas;

CREATE POLICY "School users can view likes"
  ON public.comunidade_curtidas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.comunidade_posts cp
      WHERE cp.id = comunidade_curtidas.post_id
        AND (public.is_super_admin() OR public.is_same_escola(cp.escola_id))
    )
  );

CREATE POLICY "School users can like with own profile"
  ON public.comunidade_curtidas
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = comunidade_curtidas.usuario_id
        AND ub.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.comunidade_posts cp
      WHERE cp.id = comunidade_curtidas.post_id
        AND (public.is_super_admin() OR public.is_same_escola(cp.escola_id))
    )
  );

CREATE POLICY "School users can remove own likes"
  ON public.comunidade_curtidas
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = comunidade_curtidas.usuario_id
        AND ub.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.comunidade_posts cp
      WHERE cp.id = comunidade_curtidas.post_id
        AND (public.is_super_admin() OR public.is_same_escola(cp.escola_id))
    )
  );

DROP POLICY IF EXISTS "Everyone can view audiobooks" ON public.audiobooks_biblioteca;
DROP POLICY IF EXISTS "Users can create audiobooks" ON public.audiobooks_biblioteca;
DROP POLICY IF EXISTS "Staff or creator can update audiobooks" ON public.audiobooks_biblioteca;
DROP POLICY IF EXISTS "Staff or creator can delete audiobooks" ON public.audiobooks_biblioteca;

CREATE POLICY "School users can view audiobooks"
  ON public.audiobooks_biblioteca
  FOR SELECT
  USING (public.is_super_admin() OR public.is_same_escola(escola_id));

CREATE POLICY "School users can create audiobooks"
  ON public.audiobooks_biblioteca
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_same_escola(escola_id)
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca ub
        WHERE ub.id = audiobooks_biblioteca.criado_por
          AND ub.user_id = auth.uid()
          AND ub.escola_id = audiobooks_biblioteca.escola_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.livros l
        WHERE l.id = audiobooks_biblioteca.livro_id
          AND l.escola_id = audiobooks_biblioteca.escola_id
      )
    )
  );

CREATE POLICY "School users can update audiobooks"
  ON public.audiobooks_biblioteca
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR ((public.is_gestor() OR public.is_bibliotecaria()) AND public.is_same_escola(escola_id))
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = audiobooks_biblioteca.criado_por
        AND ub.user_id = auth.uid()
        AND ub.escola_id = audiobooks_biblioteca.escola_id
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_same_escola(escola_id)
  );

CREATE POLICY "School users can delete audiobooks"
  ON public.audiobooks_biblioteca
  FOR DELETE
  USING (
    public.is_super_admin()
    OR ((public.is_gestor() OR public.is_bibliotecaria()) AND public.is_same_escola(escola_id))
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = audiobooks_biblioteca.criado_por
        AND ub.user_id = auth.uid()
        AND ub.escola_id = audiobooks_biblioteca.escola_id
    )
  );

DROP POLICY IF EXISTS "Students can view own audiobook list" ON public.aluno_audiobooks;
DROP POLICY IF EXISTS "Students can add own audiobooks" ON public.aluno_audiobooks;
DROP POLICY IF EXISTS "Students can update own audiobooks" ON public.aluno_audiobooks;
DROP POLICY IF EXISTS "Students can delete own audiobooks" ON public.aluno_audiobooks;

CREATE POLICY "Students can view own audiobook list"
  ON public.aluno_audiobooks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      JOIN public.audiobooks_biblioteca ab ON ab.id = aluno_audiobooks.audiobook_id
      WHERE ub.id = aluno_audiobooks.aluno_id
        AND ub.user_id = auth.uid()
        AND (public.is_super_admin() OR ub.escola_id = ab.escola_id)
    )
  );

CREATE POLICY "Students can add own audiobooks"
  ON public.aluno_audiobooks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      JOIN public.audiobooks_biblioteca ab ON ab.id = aluno_audiobooks.audiobook_id
      WHERE ub.id = aluno_audiobooks.aluno_id
        AND ub.user_id = auth.uid()
        AND (public.is_super_admin() OR ub.escola_id = ab.escola_id)
    )
  );

CREATE POLICY "Students can update own audiobooks"
  ON public.aluno_audiobooks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      JOIN public.audiobooks_biblioteca ab ON ab.id = aluno_audiobooks.audiobook_id
      WHERE ub.id = aluno_audiobooks.aluno_id
        AND ub.user_id = auth.uid()
        AND (public.is_super_admin() OR ub.escola_id = ab.escola_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      JOIN public.audiobooks_biblioteca ab ON ab.id = aluno_audiobooks.audiobook_id
      WHERE ub.id = aluno_audiobooks.aluno_id
        AND ub.user_id = auth.uid()
        AND (public.is_super_admin() OR ub.escola_id = ab.escola_id)
    )
  );

CREATE POLICY "Students can delete own audiobooks"
  ON public.aluno_audiobooks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      JOIN public.audiobooks_biblioteca ab ON ab.id = aluno_audiobooks.audiobook_id
      WHERE ub.id = aluno_audiobooks.aluno_id
        AND ub.user_id = auth.uid()
        AND (public.is_super_admin() OR ub.escola_id = ab.escola_id)
    )
  );

CREATE TABLE IF NOT EXISTS public.laboratorio_criacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id uuid NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  escola_id uuid REFERENCES public.escolas(id) ON DELETE SET NULL,
  livro_id uuid REFERENCES public.livros(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  titulo text,
  descricao text,
  conteudo_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  imagem_urls text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  publicado_comunidade boolean NOT NULL DEFAULT false,
  comunidade_post_id uuid REFERENCES public.comunidade_posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT laboratorio_criacoes_tipo_check CHECK (tipo IN ('imagem', 'quiz', 'resenha', 'resumo'))
);

CREATE INDEX IF NOT EXISTS laboratorio_criacoes_aluno_id_idx ON public.laboratorio_criacoes(aluno_id);
CREATE INDEX IF NOT EXISTS laboratorio_criacoes_escola_id_idx ON public.laboratorio_criacoes(escola_id);
CREATE INDEX IF NOT EXISTS laboratorio_criacoes_created_at_idx ON public.laboratorio_criacoes(created_at DESC);

ALTER TABLE public.laboratorio_criacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can manage own lab creations" ON public.laboratorio_criacoes;
DROP POLICY IF EXISTS "School staff can view lab creations" ON public.laboratorio_criacoes;

CREATE POLICY "Students can manage own lab creations"
  ON public.laboratorio_criacoes
  FOR ALL
  USING (
    public.is_super_admin()
    OR ((public.is_gestor() OR public.is_bibliotecaria()) AND public.is_same_escola(escola_id))
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = laboratorio_criacoes.aluno_id
        AND ub.user_id = auth.uid()
        AND ub.escola_id = laboratorio_criacoes.escola_id
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_same_escola(escola_id)
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca ub
        WHERE ub.id = laboratorio_criacoes.aluno_id
          AND ub.user_id = auth.uid()
          AND ub.escola_id = laboratorio_criacoes.escola_id
      )
    )
  );

DROP TRIGGER IF EXISTS update_laboratorio_criacoes_updated_at ON public.laboratorio_criacoes;
CREATE TRIGGER update_laboratorio_criacoes_updated_at
  BEFORE UPDATE ON public.laboratorio_criacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.laboratorio_criacoes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
