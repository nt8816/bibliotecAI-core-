-- Rescue migration: garante tabelas do laboratório em ambientes que perderam migrations antigas.

-- 1) atividades_entregas
CREATE TABLE IF NOT EXISTS public.atividades_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id UUID NOT NULL REFERENCES public.atividades_leitura(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  texto_entrega TEXT NOT NULL,
  anexo_url TEXT,
  status TEXT NOT NULL DEFAULT 'enviada',
  pontos_ganhos DECIMAL(5,2) NOT NULL DEFAULT 0,
  feedback_professor TEXT,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  avaliado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atividades_entregas_status_check CHECK (status IN ('enviada', 'em_revisao', 'aprovada', 'revisar')),
  CONSTRAINT atividades_entregas_unique UNIQUE (atividade_id, aluno_id)
);

ALTER TABLE public.atividades_entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students and staff can view submissions" ON public.atividades_entregas;
DROP POLICY IF EXISTS "Students can insert their own submission" ON public.atividades_entregas;
DROP POLICY IF EXISTS "Students and staff can update submission" ON public.atividades_entregas;
DROP POLICY IF EXISTS "Students and staff can delete submission" ON public.atividades_entregas;

CREATE POLICY "Students and staff can view submissions" ON public.atividades_entregas
  FOR SELECT USING (
    public.is_super_admin()
    OR public.is_gestor()
    OR public.is_bibliotecaria()
    OR public.is_professor()
    OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca ub
      WHERE ub.id = atividades_entregas.aluno_id
        AND ub.user_id = auth.uid()
    )
  );

CREATE POLICY "Students can insert their own submission" ON public.atividades_entregas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca ub
      WHERE ub.id = atividades_entregas.aluno_id
        AND ub.user_id = auth.uid()
    )
  );

CREATE POLICY "Students and staff can update submission" ON public.atividades_entregas
  FOR UPDATE USING (
    public.is_super_admin()
    OR public.is_gestor()
    OR public.is_bibliotecaria()
    OR public.is_professor()
    OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca ub
      WHERE ub.id = atividades_entregas.aluno_id
        AND ub.user_id = auth.uid()
    )
  );

CREATE POLICY "Students and staff can delete submission" ON public.atividades_entregas
  FOR DELETE USING (
    public.is_super_admin()
    OR public.is_gestor()
    OR public.is_bibliotecaria()
    OR public.is_professor()
    OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca ub
      WHERE ub.id = atividades_entregas.aluno_id
        AND ub.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS update_atividades_entregas_updated_at ON public.atividades_entregas;
CREATE TRIGGER update_atividades_entregas_updated_at
  BEFORE UPDATE ON public.atividades_entregas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2) audiobooks_biblioteca
CREATE TABLE IF NOT EXISTS public.audiobooks_biblioteca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  livro_id UUID NOT NULL REFERENCES public.livros(id) ON DELETE CASCADE,
  escola_id UUID REFERENCES public.escolas(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  autor TEXT,
  duracao_minutos INTEGER,
  audio_url TEXT NOT NULL,
  criado_por UUID REFERENCES public.usuarios_biblioteca(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audiobooks_biblioteca
  ADD COLUMN IF NOT EXISTS escola_id UUID REFERENCES public.escolas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS audiobooks_biblioteca_escola_id_idx ON public.audiobooks_biblioteca(escola_id);
ALTER TABLE public.audiobooks_biblioteca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School users can view audiobooks" ON public.audiobooks_biblioteca;
DROP POLICY IF EXISTS "School users can create audiobooks" ON public.audiobooks_biblioteca;
DROP POLICY IF EXISTS "School users can update audiobooks" ON public.audiobooks_biblioteca;
DROP POLICY IF EXISTS "School users can delete audiobooks" ON public.audiobooks_biblioteca;

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
    )
  );

CREATE POLICY "School users can update audiobooks"
  ON public.audiobooks_biblioteca
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR ((public.is_gestor() OR public.is_bibliotecaria()) AND public.is_same_escola(escola_id))
    OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca ub
      WHERE ub.id = audiobooks_biblioteca.criado_por
        AND ub.user_id = auth.uid()
        AND ub.escola_id = audiobooks_biblioteca.escola_id
    )
  )
  WITH CHECK (public.is_super_admin() OR public.is_same_escola(escola_id));

CREATE POLICY "School users can delete audiobooks"
  ON public.audiobooks_biblioteca
  FOR DELETE
  USING (
    public.is_super_admin()
    OR ((public.is_gestor() OR public.is_bibliotecaria()) AND public.is_same_escola(escola_id))
    OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca ub
      WHERE ub.id = audiobooks_biblioteca.criado_por
        AND ub.user_id = auth.uid()
        AND ub.escola_id = audiobooks_biblioteca.escola_id
    )
  );

-- 3) aluno_audiobooks
CREATE TABLE IF NOT EXISTS public.aluno_audiobooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  audiobook_id UUID NOT NULL REFERENCES public.audiobooks_biblioteca(id) ON DELETE CASCADE,
  progresso_segundos INTEGER NOT NULL DEFAULT 0,
  favorito BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT aluno_audiobooks_unique UNIQUE (aluno_id, audiobook_id)
);

ALTER TABLE public.aluno_audiobooks ENABLE ROW LEVEL SECURITY;

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

-- 4) laboratorio_criacoes
CREATE TABLE IF NOT EXISTS public.laboratorio_criacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  escola_id UUID REFERENCES public.escolas(id) ON DELETE SET NULL,
  livro_id UUID REFERENCES public.livros(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  titulo TEXT,
  descricao TEXT,
  conteudo_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  imagem_urls TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  publicado_comunidade BOOLEAN NOT NULL DEFAULT false,
  comunidade_post_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT laboratorio_criacoes_tipo_check CHECK (tipo IN ('imagem', 'quiz', 'resenha', 'resumo'))
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'comunidade_posts'
  ) THEN
    BEGIN
      ALTER TABLE public.laboratorio_criacoes
      ADD CONSTRAINT laboratorio_criacoes_comunidade_post_id_fkey
      FOREIGN KEY (comunidade_post_id) REFERENCES public.comunidade_posts(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS laboratorio_criacoes_aluno_id_idx ON public.laboratorio_criacoes(aluno_id);
CREATE INDEX IF NOT EXISTS laboratorio_criacoes_escola_id_idx ON public.laboratorio_criacoes(escola_id);
CREATE INDEX IF NOT EXISTS laboratorio_criacoes_created_at_idx ON public.laboratorio_criacoes(created_at DESC);

ALTER TABLE public.laboratorio_criacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can manage own lab creations" ON public.laboratorio_criacoes;
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
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- adiciona individualmente para evitar falha parcial
    BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.atividades_entregas'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.audiobooks_biblioteca'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.aluno_audiobooks'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.laboratorio_criacoes'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
